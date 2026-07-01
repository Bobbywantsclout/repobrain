import asyncio
import json

import google.generativeai as genai
from pydantic import BaseModel, ValidationError

from backend.config import GEMINI_API_KEY

genai.configure(api_key=GEMINI_API_KEY)

MODEL_NAME = "gemini-2.5-flash"

_model = genai.GenerativeModel(MODEL_NAME)


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


async def _extract(formatted_text: str, label: str) -> ExtractionResult:
    prompt = f"{SYSTEM_PROMPT}\n\n---\n\n{formatted_text}\n\n---\n\nExtract the JSON now."
    try:
        response = await _model.generate_content_async(
            prompt,
            generation_config=genai.GenerationConfig(response_mime_type="application/json"),
            request_options={"timeout": 30},
        )
        return ExtractionResult.model_validate_json(response.text)
    except (ValidationError, json.JSONDecodeError) as e:
        print(f"Extraction failed for {label}: malformed JSON response ({e}). Returning empty result.")
    except Exception as e:
        print(f"Extraction failed for {label}: {type(e).__name__}: {e}. Returning empty result.")
    return ExtractionResult()


async def extract_from_commit(commit: dict) -> ExtractionResult:
    """Ask Gemini to extract memory-worthy nodes from a single commit dict."""
    sha = commit.get("sha", "")[:7]
    result = await _extract(_format_commit(commit), f"commit {sha}")
    print(
        f"Extracted from commit {sha}: {len(result.decisions)} decisions, "
        f"{len(result.deprecations)} deprecations, {len(result.incidents)} incidents, "
        f"{len(result.conventions)} conventions"
    )
    return result


async def extract_from_pr(pr: dict) -> ExtractionResult:
    """Ask Gemini to extract memory-worthy nodes from a single PR dict."""
    number = pr.get("number", "")
    result = await _extract(_format_pr(pr), f"PR #{number}")
    print(
        f"Extracted from PR #{number}: {len(result.decisions)} decisions, "
        f"{len(result.deprecations)} deprecations, {len(result.incidents)} incidents, "
        f"{len(result.conventions)} conventions"
    )
    return result


async def _extract_batch(items: list[dict], extract_one) -> list[ExtractionResult]:
    semaphore = asyncio.Semaphore(5)

    async def _bounded(item):
        async with semaphore:
            return await extract_one(item)

    return await asyncio.gather(*(_bounded(item) for item in items))


async def extract_from_commits(commits: list[dict]) -> list[ExtractionResult]:
    """Extract from a list of commits, one call per commit, in parallel with a concurrency limit of 5."""
    return await _extract_batch(commits, extract_from_commit)


async def extract_from_prs(prs: list[dict]) -> list[ExtractionResult]:
    """Extract from a list of PRs, one call per PR, in parallel with a concurrency limit of 5."""
    return await _extract_batch(prs, extract_from_pr)
