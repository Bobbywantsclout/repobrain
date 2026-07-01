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


if __name__ == "__main__":
    main()
