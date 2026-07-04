import asyncio
import json

import google.generativeai as genai
from google.api_core import exceptions as google_exceptions
from google.generativeai import client as genai_client
from pydantic import BaseModel, ValidationError

from backend.config import GEMINI_EXTRACTION_API_KEYS

MODEL_NAME = "gemini-2.5-flash"

# Multi-key extraction pool. google.generativeai.configure() is process-global and
# mutable (it resets _client_manager.clients = {} on every call — confirmed by reading
# the SDK source), so naively sharing one configure() call across concurrent requests
# would race: whichever key was configured last wins for every in-flight call, silently
# routing requests to the wrong key's quota.
#
# The fix relies on a different property, also confirmed by reading the SDK source:
# GenerativeModel.generate_content_async() only builds its client lazily, on first use
# (`if self._async_client is None: self._async_client = client.get_default_generative_async_client()`),
# and then caches it ON THE INSTANCE. Once built, a model's client is fixed for that
# instance's lifetime regardless of later configure() calls. So each key gets its own
# configure() -> build-one-model -> force the lazy client into existence right away,
# done one at a time (no concurrency). After that, every model in _models has its own
# already-bound client, and calling generate_content_async() on different models
# concurrently is safe — there's no shared mutable state left to race on.
#
# Binding must happen lazily, inside a running event loop — NOT at module import time.
# google.generativeai's async gRPC client is bound to whatever event loop is active
# when it's created. Import happens before asyncio.run() starts a loop, so eagerly
# building the client at import time bound it to the wrong loop, and every real call
# later failed with "Task ... attached to a different loop" (confirmed live — this
# was a real regression, not a hypothetical). _ensure_models_ready() defers the same
# priming logic until the first call from inside an actual running loop.
_models: list[genai.GenerativeModel] = []
_setup_lock = asyncio.Lock()
_setup_done = False


async def _ensure_models_ready() -> None:
    global _setup_done
    if _setup_done:
        return
    async with _setup_lock:
        if _setup_done:
            return
        for key in GEMINI_EXTRACTION_API_KEYS:
            genai.configure(api_key=key)
            m = genai.GenerativeModel(MODEL_NAME)
            m._async_client = genai_client.get_default_generative_async_client()
            _models.append(m)
        _setup_done = True


async def get_primary_model() -> genai.GenerativeModel:
    """The first configured extraction model — used by backend.memory's answer-summary
    generation, which is low-volume (once per ask) and doesn't need multi-key parallelism."""
    await _ensure_models_ready()
    return _models[0]


class ExtractedDecision(BaseModel):
    content: str
    rationale: str  # brief explanation, why we think this is a decision


class ExtractedDeprecation(BaseModel):
    what: str
    why: str
    replaced_with: str | None = None


class ExtractedIncident(BaseModel):
    what_broke: str
    root_cause: str


class ExtractedConvention(BaseModel):
    rule: str
    confidence: float  # 0.0 to 1.0


class ExtractionResult(BaseModel):
    decisions: list[ExtractedDecision] = []
    deprecations: list[ExtractedDeprecation] = []
    incidents: list[ExtractedIncident] = []
    conventions: list[ExtractedConvention] = []


SYSTEM_PROMPT = """You analyze commits and pull requests from software repos and identify \
memory-worthy signals for a team's engineering knowledge graph. Extract only what is genuinely \
there — do NOT invent or infer beyond what the text supports. Return empty lists when nothing \
meaningful is present. Prefer precision over recall.

Extract into four categories:

- Decision: An engineering choice with rationale ("switched X to Y", "adopted pattern Z", \
"changed approach to A"). NOT: routine bug fixes without rationale, typo fixes, formatting.
- Deprecation: Something explicitly removed, replaced, or marked as no-longer-preferred. Must \
mention what and (ideally) why.
- Incident: A production issue, bug that shipped, security vulnerability, outage, or regression. \
Not just any bug — has to signal something went wrong in the field.
- Convention: A stated team standard ("we always X", "always use Y", "never do Z"). NOT: casual \
habits inferred from a single commit.

Example: a commit message like "Removed Redis due to memory leak, switched to LRU cache" should \
produce one Deprecation (what="Redis", why="memory leak", replaced_with="LRU cache") and one \
Decision (content="Adopted an LRU cache", rationale="Redis was causing a memory leak").

Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:
{
  "decisions": [{"content": "...", "rationale": "..."}],
  "deprecations": [{"what": "...", "why": "...", "replaced_with": "..." or null}],
  "incidents": [{"what_broke": "...", "root_cause": "..."}],
  "conventions": [{"rule": "...", "confidence": 0.0-1.0}]
}
Omit a category's entries (empty list) if nothing in the text supports it."""


def _format_commit(commit: dict) -> str:
    files = "\n".join(f"  - {f}" for f in commit.get("files_touched", [])) or "  (none)"
    return (
        f"COMMIT {commit.get('sha', '')[:7]}\n"
        f"Author: {commit.get('author_handle', 'unknown')}\n"
        f"Message:\n{commit.get('message', '')}\n"
        f"Files touched:\n{files}"
    )


def _format_pr(pr: dict) -> str:
    files = "\n".join(f"  - {f}" for f in pr.get("files_changed", [])) or "  (none)"
    return (
        f"PULL REQUEST #{pr.get('number', '')}\n"
        f"Title: {pr.get('title', '')}\n"
        f"Author: {pr.get('author_handle', 'unknown')}\n"
        f"Merged: {pr.get('merged', False)}\n"
        f"Description:\n{pr.get('description', '') or '(none)'}\n"
        f"Files changed:\n{files}"
    )


# Free-tier gemini-2.5-flash is rate-limited to 5 requests/minute (confirmed via a live
# 429: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", quota_value: 5) — separate
# from and much tighter than the per-day cap. A burst of concurrent calls exhausts this
# in seconds, so every call needs to survive a 429 by backing off and retrying, not just
# logging and giving up.
MAX_RATE_LIMIT_RETRIES = 4
RATE_LIMIT_BACKOFF_SECONDS = 20


async def _extract(model: genai.GenerativeModel, formatted_text: str, label: str) -> ExtractionResult:
    prompt = f"{SYSTEM_PROMPT}\n\n---\n\n{formatted_text}\n\n---\n\nExtract the JSON now."
    for attempt in range(1, MAX_RATE_LIMIT_RETRIES + 1):
        try:
            response = await model.generate_content_async(
                prompt,
                generation_config=genai.GenerationConfig(response_mime_type="application/json"),
                request_options={"timeout": 30},
            )
            return ExtractionResult.model_validate_json(response.text)
        except (ValidationError, json.JSONDecodeError) as e:
            print(f"Extraction failed for {label}: malformed JSON response ({e}). Returning empty result.")
            break
        except google_exceptions.ResourceExhausted as e:
            if attempt == MAX_RATE_LIMIT_RETRIES:
                print(
                    f"Extraction failed for {label}: rate limit exceeded after "
                    f"{MAX_RATE_LIMIT_RETRIES} attempts. Returning empty result."
                )
                break
            print(
                f"Rate limited extracting {label} (attempt {attempt}/{MAX_RATE_LIMIT_RETRIES}), "
                f"waiting {RATE_LIMIT_BACKOFF_SECONDS}s before retrying: {e}"
            )
            await asyncio.sleep(RATE_LIMIT_BACKOFF_SECONDS)
        except Exception as e:
            print(f"Extraction failed for {label}: {type(e).__name__}: {e}. Returning empty result.")
            break
    return ExtractionResult()


async def extract_from_commit(commit: dict, model: genai.GenerativeModel | None = None) -> ExtractionResult:
    """Ask Gemini to extract memory-worthy nodes from a single commit dict."""
    sha = commit.get("sha", "")[:7]
    result = await _extract(model or await get_primary_model(), _format_commit(commit), f"commit {sha}")
    print(
        f"Extracted from commit {sha}: {len(result.decisions)} decisions, "
        f"{len(result.deprecations)} deprecations, {len(result.incidents)} incidents, "
        f"{len(result.conventions)} conventions"
    )
    return result


async def extract_from_pr(pr: dict, model: genai.GenerativeModel | None = None) -> ExtractionResult:
    """Ask Gemini to extract memory-worthy nodes from a single PR dict."""
    number = pr.get("number", "")
    result = await _extract(model or await get_primary_model(), _format_pr(pr), f"PR #{number}")
    print(
        f"Extracted from PR #{number}: {len(result.decisions)} decisions, "
        f"{len(result.deprecations)} deprecations, {len(result.incidents)} incidents, "
        f"{len(result.conventions)} conventions"
    )
    return result


async def _extract_batch(items: list[dict], extract_one) -> list[ExtractionResult]:
    # Concurrency of 2 per key, not 5: the free tier's 5 requests/minute cap (per key)
    # means 5 concurrent calls on one key exhausts an entire minute's budget in one
    # burst, before the first response even comes back — confirmed live (43 of 50 calls
    # hit ResourceExhausted in a single ingest run on a single key). Items are round-
    # robined across every configured key, each with its own retry-with-backoff (see
    # _extract) and its own 2-slot semaphore, so N keys gives N times the throughput,
    # not just N times the burst tolerance.
    await _ensure_models_ready()
    semaphores = [asyncio.Semaphore(2) for _ in _models]

    async def _bounded(i: int, item: dict):
        model = _models[i % len(_models)]
        semaphore = semaphores[i % len(_models)]
        async with semaphore:
            return await extract_one(item, model)

    return await asyncio.gather(*(_bounded(i, item) for i, item in enumerate(items)))


async def extract_from_commits(commits: list[dict]) -> list[ExtractionResult]:
    """Extract from a list of commits, one call per commit, round-robined across all configured keys."""
    return await _extract_batch(commits, extract_from_commit)


async def extract_from_prs(prs: list[dict]) -> list[ExtractionResult]:
    """Extract from a list of PRs, one call per PR, round-robined across all configured keys."""
    return await _extract_batch(prs, extract_from_pr)
