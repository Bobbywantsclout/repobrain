import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from backend.extraction import extract_from_commits, extract_from_prs
from backend.ingestion import GitHubIngestor

load_dotenv()


def _print_result(label: str, result):
    print(f"\n{label}")
    if not any([result.decisions, result.deprecations, result.incidents, result.conventions]):
        print("  (nothing extracted)")
        return
    for d in result.decisions:
        print(f"  [Decision] {d.content} — {d.rationale}")
    for d in result.deprecations:
        print(f"  [Deprecation] {d.what} (why: {d.why}, replaced_with: {d.replaced_with})")
    for i in result.incidents:
        print(f"  [Incident] {i.what_broke} — root cause: {i.root_cause}")
    for c in result.conventions:
        print(f"  [Convention] {c.rule} (confidence: {c.confidence})")


async def main():
    token = os.getenv("GITHUB_TOKEN")
    ingestor = GitHubIngestor(token, "vercel/ms")

    commits = ingestor.fetch_commits(limit=3)
    prs = ingestor.fetch_pull_requests(limit=3)

    print("\n=== Extracting from commits ===")
    commit_results = await extract_from_commits(commits)

    print("\n=== Extracting from pull requests ===")
    pr_results = await extract_from_prs(prs)

    print("\n\n================ RESULTS ================")
    for commit, result in zip(commits, commit_results):
        _print_result(f"Commit {commit['sha'][:7]}: {commit['message'].splitlines()[0]}", result)

    for pr, result in zip(prs, pr_results):
        _print_result(f"PR #{pr['number']}: {pr['title']}", result)


if __name__ == "__main__":
    asyncio.run(main())
