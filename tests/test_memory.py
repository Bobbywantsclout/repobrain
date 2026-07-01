import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cognee.infrastructure.databases.graph import get_graph_engine

from backend.memory import ingest_repo_into_memory, search_memory

QUERIES = [
    "What security issues has this project had?",
    "What performance improvements have been made?",
    "What has been deprecated?",
]


async def verify_decision_commit_edge():
    """Inspect Cognee's persisted graph directly to confirm a Decision node has a real
    edge to a Commit node — not just that our Python object held a reference before push."""
    graph_engine = await get_graph_engine()
    nodes, edges = await graph_engine.get_graph_data()
    nodes_by_id = {str(node_id): attrs for node_id, attrs in nodes}

    decision_nodes = [
        (node_id, attrs) for node_id, attrs in nodes_by_id.items() if attrs.get("type") == "Decision"
    ]
    if not decision_nodes:
        print("No Decision nodes present in the graph (Gemini extracted nothing this run).")
        return

    for decision_id, decision_attrs in decision_nodes:
        for source_id, target_id, relationship, _props in edges:
            source_id, target_id = str(source_id), str(target_id)
            other_id = None
            if source_id == decision_id:
                other_id = target_id
            elif target_id == decision_id:
                other_id = source_id
            if other_id and nodes_by_id.get(other_id, {}).get("type") == "Commit":
                commit_attrs = nodes_by_id[other_id]
                print(f"CONFIRMED real graph edge: Decision --[{relationship}]--> Commit")
                print(f"  Decision.content = {decision_attrs.get('content')!r}")
                print(f"  Commit.sha       = {commit_attrs.get('sha')!r}")
                return
    print("Decision node(s) found, but no edge to a Commit node (may be PR-sourced instead).")


async def main():
    counts = await ingest_repo_into_memory("vercel/ms", commit_limit=5, pr_limit=3)
    print("\n=== Ingestion counts ===")
    print(counts)

    print("\n=== Verifying Decision -> Commit graph edge ===")
    await verify_decision_commit_edge()

    for query in QUERIES:
        print(f"\n=== Query: {query} ===")
        results = await search_memory(query, top_k=3)
        for r in results:
            print(" -", r)


if __name__ == "__main__":
    asyncio.run(main())
