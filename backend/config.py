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
