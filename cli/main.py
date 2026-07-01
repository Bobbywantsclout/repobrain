import argparse
import asyncio
import sys

from rich.console import Console
from rich.table import Table

console = Console()

try:
    from backend.config import parse_github_repo
    from backend.memory import ingest_repo_into_memory, search_memory
except RuntimeError as e:
    console.print(f"[red]Configuration error:[/red] {e}")
    sys.exit(1)

SEMANTIC_TYPES = {"Decision", "Deprecation", "Incident", "Convention"}


def _node_dedup_key(node: dict):
    return (
        node.get("type"),
        node.get("content") or node.get("what_broke") or node.get("what") or node.get("rule"),
    )


def _extract_nodes(results: list[dict]) -> list[dict]:
    """Flatten search_memory's triplet results into a deduped list of semantic-type nodes.

    search_memory returns {source, relationship, target} triplets — either side can be the
    semantic node depending on which direction the retriever matched the query. We dedupe on
    (type, headline text) rather than "id", since the id field coming back through the graph
    retriever is unreliable (frequently None in practice).

    Each extracted node is enriched with "_linked_node" (the other side of the triplet —
    the Commit/PullRequest it references, if any) and "_relationship" (the edge name, e.g.
    "source_commit"/"source_pr"), since only Decision has its own source_type field —
    Deprecation/Incident/Convention need the edge itself to know commit-vs-PR provenance.
    """
    seen = set()
    nodes = []
    for r in results:
        pairs = [(r.get("source"), r.get("target")), (r.get("target"), r.get("source"))]
        for node, other in pairs:
            if not node or node.get("type") not in SEMANTIC_TYPES:
                continue
            dedup_key = _node_dedup_key(node)
            if dedup_key in seen:
                continue
            seen.add(dedup_key)
            enriched = dict(node)
            enriched["_linked_node"] = other
            enriched["_relationship"] = r.get("relationship")
            nodes.append(enriched)
    return nodes


def _format_source(node: dict) -> str:
    linked = node.get("_linked_node") or {}
    relationship = node.get("_relationship")

    if relationship == "source_commit" and linked.get("type") == "Commit":
        sha = linked.get("sha")
        if sha:
            return f"(from commit {sha[:7]})"
    if relationship == "source_pr" and linked.get("type") == "PullRequest":
        number = linked.get("number")
        if number is not None:
            return f"(from PR #{number})"

    if node.get("type") == "Convention":
        refs = node.get("source_refs") or []
        if not refs:
            return ""
        if len(refs) == 1:
            return f"(from {refs[0]})"
        return f"(from {len(refs)} sources)"

    # Fallback: only Decision carries its own source_type/source_ref fields.
    source_type = node.get("source_type")
    source_ref = node.get("source_ref")
    if source_ref and source_type == "commit":
        return f"(from commit {source_ref[:7]})"
    if source_ref and source_type == "pr":
        return f"(from PR #{source_ref})"
    return ""


def _format_content(node: dict) -> str:
    node_type = node.get("type")
    if node_type == "Incident":
        return node.get("what_broke", "")
    if node_type == "Decision":
        return node.get("content", "")
    if node_type == "Deprecation":
        what = node.get("what", "")
        replaced = node.get("replaced_with")
        return f"{what} → {replaced}" if replaced else what
    if node_type == "Convention":
        return node.get("rule", "")
    return str(node)


def cmd_ingest(args: argparse.Namespace) -> None:
    try:
        repo = parse_github_repo(args.repo)
    except ValueError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)

    console.rule(f"[bold cyan]RepoBrain — Ingesting {repo}[/bold cyan]")

    try:
        counts = asyncio.run(
            ingest_repo_into_memory(repo, commit_limit=args.commits, pr_limit=args.prs)
        )
    except RuntimeError as e:
        console.print(f"[red]Configuration error:[/red] {e}")
        sys.exit(1)
    except Exception as e:
        console.print(f"[red]Ingestion failed:[/red] {type(e).__name__}: {e}")
        sys.exit(1)

    console.print()
    console.print(f"[bold]Repository:[/bold] {repo}")
    console.rule(style="dim")

    table = Table(show_header=False, box=None, padding=(0, 1))
    table.add_column(justify="left")
    table.add_column(justify="right")
    table.add_row("  Commits ingested:", str(counts["commits"]))
    table.add_row("  Pull requests ingested:", str(counts["prs"]))
    table.add_row("  Files indexed:", str(counts["files"]))
    table.add_row("  Decisions extracted:", str(counts["decisions"]))
    table.add_row("  Deprecations extracted:", str(counts["deprecations"]))
    table.add_row("  Incidents extracted:", str(counts["incidents"]))
    table.add_row("  Conventions extracted:", str(counts["conventions"]))
    console.print(table)

    console.rule(style="dim")
    console.print(f"[bold green]Total DataPoints pushed:[/bold green] {counts['total_datapoints']}")


def cmd_ask(args: argparse.Namespace) -> None:
    try:
        results = asyncio.run(search_memory(args.question, top_k=args.top_k))
    except Exception as e:
        console.print(f"[red]Search failed:[/red] {type(e).__name__}: {e}")
        sys.exit(1)

    console.print(f"[bold]Question:[/bold] {args.question}")
    console.rule(style="dim")
    console.print()

    nodes = _extract_nodes(results)

    if not nodes:
        answers = [r["answer"] for r in results if "answer" in r]
        if answers:
            console.print(answers[0])
        else:
            console.print(
                "[yellow]No memory nodes found for this question yet.[/yellow] "
                "Try ingesting a repo first with `repobrain ingest <repo>`."
            )
        return

    for i, node in enumerate(nodes[: args.top_k], start=1):
        source_tag = _format_source(node)
        header = f"[bold cyan][{i}][/bold cyan] [bold]{node['type']}[/bold]"
        if source_tag:
            header += f" {source_tag}"
        console.print(header)
        console.print(f'    "{_format_content(node)}"')
        console.print()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="repobrain", description="A memory layer for AI coding agents."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest_parser = subparsers.add_parser("ingest", help="Ingest a GitHub repo into memory")
    ingest_parser.add_argument("repo", help="GitHub URL or owner/repo")
    ingest_parser.add_argument(
        "--commits", type=int, default=20, help="Max commits to ingest (default: 20)"
    )
    ingest_parser.add_argument(
        "--prs", type=int, default=10, help="Max pull requests to ingest (default: 10)"
    )

    ask_parser = subparsers.add_parser("ask", help="Ask a question against ingested memory")
    ask_parser.add_argument("question", help="Natural-language question")
    ask_parser.add_argument(
        "--top-k",
        type=int,
        default=5,
        dest="top_k",
        help="Number of results to show (default: 5)",
    )

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "ingest":
        cmd_ingest(args)
    elif args.command == "ask":
        cmd_ask(args)


if __name__ == "__main__":
    main()
