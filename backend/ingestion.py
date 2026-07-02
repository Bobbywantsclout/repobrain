import functools
import os

from github import Auth, Github
from github.GithubException import (
    BadCredentialsException,
    GithubException,
    RateLimitExceededException,
)

LANGUAGE_BY_EXTENSION = {
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".py": "Python",
    ".rb": "Ruby",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".kt": "Kotlin",
    ".swift": "Swift",
    ".c": "C",
    ".cpp": "C++",
    ".cs": "C#",
    ".php": "PHP",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".sass": "Sass",
    ".vue": "Vue",
    ".svelte": "Svelte",
    ".md": "Markdown",
    ".mdx": "Markdown",
    ".rst": "reStructuredText",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".toml": "TOML",
    ".xml": "XML",
    ".sh": "Shell",
    ".bash": "Shell",
    ".zsh": "Shell",
    ".ps1": "PowerShell",
    ".sql": "SQL",
    ".dockerfile": "Docker",
    ".env": "Environment",
    ".svg": "Asset",
    ".png": "Asset",
    ".jpg": "Asset",
    ".jpeg": "Asset",
    ".gif": "Asset",
    ".webp": "Asset",
    ".ico": "Asset",
}

SPECIAL_FILENAMES = {
    "Dockerfile": "Docker",
    "Makefile": "Makefile",
    ".gitignore": "Git",
    ".dockerignore": "Docker",
    "package.json": "NPM Config",
    "package-lock.json": "NPM Config",
    "pnpm-lock.yaml": "NPM Config",
    "yarn.lock": "NPM Config",
    ".npmrc": "NPM Config",
    "requirements.txt": "Python Config",
    "Pipfile": "Python Config",
    "pyproject.toml": "Python Config",
    "poetry.lock": "Python Config",
    ".env.example": "Environment",
    ".env.local": "Environment",
}


def detect_language(path: str) -> str:
    """Best-guess language/category for a file path: special filenames first, then extension."""
    filename = os.path.basename(path)
    if filename in SPECIAL_FILENAMES:
        return SPECIAL_FILENAMES[filename]
    extension = os.path.splitext(filename)[1].lower()
    return LANGUAGE_BY_EXTENSION.get(extension, "Unknown")


def _handle_github_errors(method):
    """Catch rate-limit/auth errors from a fetch_* method, print guidance, and return []."""

    @functools.wraps(method)
    def wrapper(self, *args, **kwargs):
        try:
            return method(self, *args, **kwargs)
        except RateLimitExceededException:
            print(
                "GitHub API rate limit exceeded. Wait for your rate limit to reset "
                "(check the 'X-RateLimit-Reset' header or https://github.com/settings/tokens), "
                "then re-run this command."
            )
            return []
        except BadCredentialsException:
            print(
                "GitHub authentication failed (bad credentials). "
                "Check that GITHUB_TOKEN in your .env file is set to a valid, non-expired token."
            )
            return []
        except GithubException as e:
            if e.status == 401:
                print(
                    "GitHub authentication failed (401 Unauthorized). "
                    "Check that GITHUB_TOKEN in your .env file is set to a valid, non-expired token."
                )
                return []
            if e.status == 404:
                print(
                    f"GitHub API returned 404 for this request on '{self.repo_full_name}' "
                    "(the endpoint may be unavailable for this repo). Treating as empty."
                )
                return []
            raise

    return wrapper


class GitHubIngestor:
    """Fetches raw commit, pull request, and file-tree data from a GitHub repository via PyGithub."""

    def __init__(self, github_token: str, repo_full_name: str):
        self.github_token = github_token
        self.repo_full_name = repo_full_name
        self.client = Github(auth=Auth.Token(github_token))
        try:
            self.repo = self.client.get_repo(repo_full_name)
        except BadCredentialsException:
            print(
                "GitHub authentication failed (bad credentials). "
                "Check that GITHUB_TOKEN in your .env file is set to a valid, non-expired token."
            )
            raise
        except GithubException as e:
            if e.status == 401:
                print(
                    "GitHub authentication failed (401 Unauthorized). "
                    "Check that GITHUB_TOKEN in your .env file is set to a valid, non-expired token."
                )
            raise

    @_handle_github_errors
    def fetch_commits(self, branch: str = None, limit: int = 50) -> list[dict]:
        """Fetch commits from a specific branch. If branch is None, uses the repo's default branch."""
        resolved_branch = branch or self.repo.default_branch
        commits = []
        for commit in self.repo.get_commits(sha=resolved_branch):
            if len(commits) >= limit:
                break
            author_login = commit.author.login if commit.author else None
            author_handle = author_login or commit.commit.author.name
            commits.append(
                {
                    "sha": commit.sha,
                    "message": commit.commit.message,
                    "author_handle": author_handle,
                    "timestamp": commit.commit.author.date,
                    "files_touched": [f.filename for f in commit.files],
                    "branch": resolved_branch,
                }
            )
        print(f"Fetched {len(commits)} commits from branch '{resolved_branch}'")
        return commits

    @_handle_github_errors
    def fetch_pull_requests(
        self, state: str = "all", limit: int = 20, base_branch: str = None
    ) -> list[dict]:
        """Fetch PRs targeting a specific base branch. If base_branch is None, returns all PRs."""
        get_pulls_kwargs = {"state": state}
        if base_branch:
            get_pulls_kwargs["base"] = base_branch

        pull_requests = []
        for pr in self.repo.get_pulls(**get_pulls_kwargs):
            if len(pull_requests) >= limit:
                break
            author_handle = pr.user.login if pr.user else "unknown"
            reviewer_handles = list(
                dict.fromkeys(
                    review.user.login for review in pr.get_reviews() if review.user
                )
            )
            pull_requests.append(
                {
                    "number": pr.number,
                    "title": pr.title,
                    "description": pr.body or "",
                    "author_handle": author_handle,
                    "files_changed": [f.filename for f in pr.get_files()],
                    "reviewer_handles": reviewer_handles,
                    "merged": pr.merged,
                    "branch": pr.base.ref,
                }
            )
        suffix = f" targeting '{base_branch}'" if base_branch else ""
        print(f"Fetched {len(pull_requests)} pull requests{suffix}")
        return pull_requests

    @_handle_github_errors
    def fetch_file_tree(self, branch: str = None) -> list[dict]:
        """Fetch the file tree from a specific branch. If branch is None, uses the repo's default branch."""
        resolved_branch = branch or self.repo.default_branch
        files = []
        contents = self.repo.get_contents("", ref=resolved_branch)
        while contents:
            item = contents.pop(0)
            if item.type == "dir":
                contents.extend(self.repo.get_contents(item.path, ref=resolved_branch))
            else:
                language = detect_language(item.path)
                files.append({"path": item.path, "language": language})
        print(f"Fetched {len(files)} files from branch '{resolved_branch}'")
        return files

    @_handle_github_errors
    def list_branches(self, limit: int = 10) -> list[str]:
        """
        Return branch names, default branch first, then others by most recent activity.
        Cap at `limit` to avoid making too many API calls in one ingestion.

        Note: ranking by "most recent activity" requires an extra API call per branch
        (to read its tip commit's date), so to keep the call count bounded we only
        inspect the first `limit - 1` non-default branches GitHub returns (not
        necessarily the globally most-recent ones if the repo has more branches than
        `limit`) and sort recency within that slice.
        """
        default_branch = self.repo.default_branch
        all_branches = list(self.repo.get_branches())
        candidates = [b for b in all_branches if b.name != default_branch][: max(limit - 1, 0)]

        n = len(candidates)
        dated = []
        for i, branch in enumerate(candidates):
            print(f"Fetching branch {i + 1}/{n}: {branch.name}")
            dated.append((branch.commit.commit.author.date, branch.name))
        dated.sort(key=lambda pair: pair[0], reverse=True)

        names = [default_branch] + [name for _, name in dated]
        print(f"Found {len(all_branches)} branches total, using {len(names[:limit])}")
        return names[:limit]
