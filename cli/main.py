import argparse
import asyncio
import sys

from rich.console import Console
from rich.table import Table

console = Console()

try:
    from backend.config import parse_github_repo
    from backend.memory import (
        get_divergent_branches,
        ingest_repo_into_memory,
        search_memory_with_confidence,
    )
except RuntimeError as e:
    console.print(f"[red]Configuration error:[/red] {e}")
    sys.exit(1)

CONFIDENCE_STYLES = {
    "HIGH": "bold green",
    "MEDIUM": "bold yellow",
    "LOW": "dim",
}

TYPE_COLORS = {
    "Decision": "blue",
    "Deprecation": "red",
    "Incident": "orange3",
    "Convention": "green",
    "UserInstruction": "magenta",
    "Correction": "magenta",
}


def _type_color(node_type: str) -> str:
    return TYPE_COLORS.get(node_type, "dim")


def _format_source_ref(node: dict) -> str:
    """Bare 'PR #292' / 'abc1234' / 'unknown source' — no parens, no leading word,
    for the compact `▸ Type · from <this> · branch: ...` source line."""
    linked = node.get("_linked_node") or {}
    relationship = node.get("_relationship")

    if relationship == "source_commit" and linked.get("type") == "Commit":
        sha = linked.get("sha")
        if sha:
            return sha[:7]
    if relationship == "source_pr" and linked.get("type") == "PullRequest":
        number = linked.get("number")
        if number is not None:
            return f"PR #{number}"

    if node.get("type") == "Convention":
        refs = node.get("source_refs") or []
        if refs:
            return refs[0] if len(refs) == 1 else f"{len(refs)} sources"

    # Fallback: only Decision carries its own source_type/source_ref fields.
    source_type = node.get("source_type")
    source_ref = node.get("source_ref")
    if source_ref and source_type == "commit":
        return source_ref[:7]
    if source_ref and source_type == "pr":
        return f"PR #{source_ref}"

    return "unknown source"


def _format_branch(node: dict) -> str:
    """Returns "" (not a placeholder string) when no branch is known, so callers can
    skip the "· branch: ..." segment entirely rather than showing a hollow tag."""
    branch = node.get("branch")
    if not branch:
        linked = node.get("_linked_node") or {}
        branch = linked.get("branch")
    return branch or ""


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
    if node_type == "UserInstruction":
        return node.get("content", "")
    if node_type == "Correction":
        return f"AI suggested '{node.get('ai_suggested', '')}', user said '{node.get('user_said', '')}'"
    return str(node)


def cmd_ingest(args: argparse.Namespace) -> None:
    try:
        repo = parse_github_repo(args.repo)
    except ValueError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)

    branches = [b.strip() for b in args.branches.split(",")] if args.branches else None

    console.rule(f"[bold cyan]RepoBrain — Ingesting {repo}[/bold cyan]")

    try:
        counts = asyncio.run(
            ingest_repo_into_memory(
                repo, branches=branches, commit_limit=args.commits, pr_limit=args.prs
            )
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
    for branch_name, n in counts.get("commits_per_branch", {}).items():
        table.add_row(f"    - {branch_name}:", str(n))
    table.add_row("  Pull requests ingested:", str(counts["prs"]))
    for branch_name, n in counts.get("prs_per_branch", {}).items():
        table.add_row(f"    - {branch_name}:", str(n))
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
        result = asyncio.run(
            search_memory_with_confidence(args.question, top_k=args.top_k, branch=args.branch)
        )
    except Exception as e:
        console.print(f"[red]Search failed:[/red] {type(e).__name__}: {e}")
        sys.exit(1)

    console.print(f"[bold]Answer:[/bold] {result['answer']}")
    console.print()

    confidence = result["confidence"]
    confidence_style = CONFIDENCE_STYLES.get(confidence, "dim")
    console.print(
        f"[bold]Confidence:[/bold] [{confidence_style}]{confidence}[/{confidence_style}]"
        f" [dim]— {result['confidence_reason']}[/dim]"
    )
    console.print()

    sources = result["sources"]
    if not sources:
        console.print(
            "[yellow]No memory nodes found for this question yet.[/yellow] "
            "Try ingesting a repo first with `repobrain ingest <repo>`."
        )
    else:
        for node in sources:
            type_color = _type_color(node["type"])
            line = f"  [dim]▸[/dim] [{type_color}]{node['type']}[/{type_color}]"
            line += f" [dim]· from {_format_source_ref(node)}[/dim]"
            branch = _format_branch(node)
            if branch:
                line += f" [dim]· branch: {branch}[/dim]"
            console.print(line)
            console.print(f"    {_format_content(node)}")
            console.print()

    if args.branch is not None:
        divergent = asyncio.run(get_divergent_branches(args.question, args.branch, top_k=args.top_k))
        if divergent:
            console.print()
            console.print(
                f"[dim]Note: {len(divergent)} other branch(es) have divergent decisions "
                f"on this topic: {', '.join(divergent)}[/dim]"
            )
            console.print(
                '[dim]Query those branches with: repobrain ask "..." --branch <name>[/dim]'
            )


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
    ingest_parser.add_argument(
        "--branches",
        type=str,
        default=None,
        help=(
            "Comma-separated branch names to ingest (e.g. --branches main,develop). "
            "Default: repo's default branch only."
        ),
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
    ask_parser.add_argument(
        "--branch",
        type=str,
        default=None,
        help="Restrict results to a specific branch (e.g. --branch main)",
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
