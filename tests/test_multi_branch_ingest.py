import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cognee.infrastructure.databases.graph import get_graph_engine

from backend.memory import ingest_repo_into_memory

BRANCHES = ["main", "paul/use-vitest"]


async def verify_branch_commit_nodes():
    """Query Cognee's persisted graph directly to confirm each branch got its own
    distinct Commit node(s) rather than colliding on sha alone."""
    graph_engine = await get_graph_engine()
    nodes, _edges = await graph_engine.get_graph_data()

    commits_by_branch: dict[str, list[str]] = {b: [] for b in BRANCHES}
    for node_id, attrs in nodes:
        if attrs.get("type") == "Commit" and attrs.get("branch") in commits_by_branch:
            commits_by_branch[attrs["branch"]].append(str(node_id))

    for branch, ids in commits_by_branch.items():
        print(f"Commit nodes with branch={branch!r}: {len(ids)}")

    for branch in BRANCHES:
        assert commits_by_branch[branch], f"expected at least one Commit node for branch {branch!r}"

    main_ids = set(commits_by_branch["main"])
    feature_ids = set(commits_by_branch["paul/use-vitest"])
    overlap = main_ids & feature_ids
    assert not overlap, f"Commit node ids should be distinct per branch, but overlap: {overlap}"
    print("CONFIRMED: main and paul/use-vitest Commit nodes have distinct ids.")


async def main():
    counts = await ingest_repo_into_memory(
        "vercel/ms", branches=BRANCHES, commit_limit=3, pr_limit=2
    )

    print("\n=== Ingestion counts ===")
    print(counts)

    assert counts["branches_ingested"] == BRANCHES, (
        f"expected branches_ingested == {BRANCHES}, got {counts['branches_ingested']}"
    )
    assert counts["commits_per_branch"]["main"] > 0, "expected commits from 'main'"
    assert counts["commits_per_branch"]["paul/use-vitest"] > 0, (
        "expected commits from 'paul/use-vitest'"
    )
    assert counts["commits"] >= 4, f"expected total commits >= 4, got {counts['commits']}"

    print("\n=== Graph-level verification ===")
    await verify_branch_commit_nodes()

    print("\nAll assertions passed.")


if __name__ == "__main__":
    asyncio.run(main())
