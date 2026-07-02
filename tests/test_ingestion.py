import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from backend.config import parse_github_repo
from backend.ingestion import GitHubIngestor

load_dotenv()


def main():
    token = os.getenv("GITHUB_TOKEN")

    test_repo = os.getenv("TEST_REPO")
    if not test_repo:
        test_repo = "vercel/ms"
        print("TEST_REPO not set in .env, defaulting to vercel/ms")

    parsed_repo = parse_github_repo(test_repo)
    print(f"Testing ingestion against: {parsed_repo}")

    ingestor = GitHubIngestor(token, parsed_repo)

    commits = ingestor.fetch_commits(limit=5)
    print(commits)

    pull_requests = ingestor.fetch_pull_requests(limit=5)
    print(pull_requests)

    file_tree = ingestor.fetch_file_tree()
    print(file_tree[:10])

    print("\n=== Branch awareness (Phase 1) ===")

    branches = ingestor.list_branches()
    print("branches:", branches)
    assert len(branches) >= 1, "list_branches() should return at least the default branch"

    # vercel/ms's default (and only long-lived) branch is "main", not "master" — confirmed
    # by list_branches() above. Using the real branch name rather than a guessed one that
    # 404s (our error handling correctly turns that into an empty list, not a crash, but
    # a test that only ever observes empty results wouldn't actually verify anything).
    test_branch = branches[0]

    branch_commits = ingestor.fetch_commits(branch=test_branch, limit=5)
    print("branch_commits:", branch_commits)
    assert branch_commits, f"fetch_commits(branch={test_branch!r}) should return commits"
    assert all(c["branch"] == test_branch for c in branch_commits), (
        f"every commit dict should carry branch={test_branch!r}"
    )

    branch_prs = ingestor.fetch_pull_requests(base_branch=test_branch, limit=5)
    print("branch_prs:", branch_prs)
    assert all(pr["branch"] == test_branch for pr in branch_prs), (
        f"every PR dict should carry branch={test_branch!r} when filtered by base_branch"
    )


if __name__ == "__main__":
    main()
