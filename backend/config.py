import os
import re

from dotenv import load_dotenv

load_dotenv()

_GITHUB_REPO_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_HTTPS_PREFIX_PATTERN = re.compile(r"^https?://([^/]+)/(.+)$")
_SSH_PREFIX_PATTERN = re.compile(r"^git@([^:]+):(.+)$")


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable '{name}'. "
            f"Copy .env.example to .env and set {name}."
        )
    return value


def parse_github_repo(repo_input: str) -> str:
    """
    Normalize any GitHub repo reference to the canonical 'owner/repo' form.

    Accepts:
      - 'owner/repo'
      - 'https://github.com/owner/repo'
      - 'https://github.com/owner/repo.git'
      - 'https://github.com/owner/repo/'  (trailing slash)
      - 'git@github.com:owner/repo.git'   (SSH form)

    Raises ValueError with a clear message if the input can't be parsed
    or doesn't match the owner/repo pattern.
    """
    value = repo_input.strip().rstrip("/")

    https_match = _HTTPS_PREFIX_PATTERN.match(value)
    ssh_match = _SSH_PREFIX_PATTERN.match(value)

    if https_match or ssh_match:
        host, path = (https_match or ssh_match).groups()
        if host.lower() != "github.com":
            raise ValueError(
                f"Could not parse '{repo_input}' as a GitHub repo. "
                f"Expected 'owner/repo' or a GitHub URL."
            )
        value = path

    if value.endswith(".git"):
        value = value[: -len(".git")]
    value = value.rstrip("/")

    if not _GITHUB_REPO_PATTERN.match(value):
        raise ValueError(
            f"Could not parse '{repo_input}' as a GitHub repo. "
            f"Expected 'owner/repo' or a GitHub URL."
        )

    return value


GEMINI_API_KEY = _require_env("GEMINI_API_KEY")
GITHUB_TOKEN = _require_env("GITHUB_TOKEN")
TEST_REPO = os.getenv("TEST_REPO") or "vercel/ms"

# Optional second key so embedding calls (used during ingestion AND every search —
# ask, forget/preview) draw from a separate free-tier quota pool than generation calls
# (extraction, answer synthesis). Without this, both workloads share one 5-req/min
# budget and starve each other under load. Falls back to the primary key if unset, so
# existing single-key setups keep working unchanged.
GEMINI_EMBEDDING_API_KEY = os.getenv("GEMINI_EMBEDDING_API_KEY") or GEMINI_API_KEY

# Optional pool of keys for commit/PR extraction specifically, comma-separated. Each
# key has its own independent free-tier quota (5 req/min AND 20 req/day, confirmed via
# live 429s on both limits) — N keys means N times the extraction throughput, not just
# N times the burst tolerance. Falls back to a single-key list [GEMINI_API_KEY] if unset.
_extraction_keys_raw = os.getenv("GEMINI_EXTRACTION_API_KEYS", "")
GEMINI_EXTRACTION_API_KEYS = [k.strip() for k in _extraction_keys_raw.split(",") if k.strip()] or [
    GEMINI_API_KEY
]
