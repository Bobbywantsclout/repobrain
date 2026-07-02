import sys
import time
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Running this file directly (`python mcp_server/repobrain.py`) puts mcp_server/,
# not the project root, on sys.path — "backend" wouldn't be importable otherwise.
# Same fix already used by tests/test_*.py.
sys.path.insert(0, str(_PROJECT_ROOT))

from dotenv import load_dotenv

# Claude Code spawns this as a subprocess whose cwd isn't the project root, so
# load_dotenv() with no args (which searches from cwd) can't find .env. Load it
# by absolute path instead, before anything that reads env vars gets imported.
load_dotenv(_PROJECT_ROOT / ".env")

# Eager, one-time import at module load — NOT lazy. A lazy import triggered from
# inside a tool handler deadlocks on Windows: Cognee's async init running from
# within FastMCP's already-running stdio event loop collides with a second init
# path FastMCP's transport triggers, and the two hang on a shared resource forever.
# Paying the ~10s Cognee init cost once here, before mcp.run() starts, avoids that
# entirely and stays comfortably under Claude Code's 60s handshake timeout.
_start = time.time()
import backend.memory as _backend_memory

print(f"RepoBrain: Cognee loaded in {time.time() - _start:.1f}s", file=sys.stderr)

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("RepoBrain")

SEMANTIC_TYPES = {
    "Decision",
    "Deprecation",
    "Incident",
    "Convention",
    "UserInstruction",
    "Correction",
}


def _node_dedup_key(node: dict):
    return (
        node.get("type"),
        node.get("content")
        or node.get("what_broke")
        or node.get("what")
        or node.get("rule")
        or node.get("user_said"),
    )


def _extract_nodes(results: list[dict]) -> list[dict]:
    """Flatten search_memory's triplet results into a deduped list of semantic-type nodes,
    enriched with the linked node + relationship so _format_source can attribute provenance.
    Mirrors cli/main.py's approach, extended to cover UserInstruction/Correction."""
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
            return f"commit {sha[:7]}"
    if relationship == "source_pr" and linked.get("type") == "PullRequest":
        number = linked.get("number")
        if number is not None:
            return f"PR #{number}"
    if relationship == "source_session" and linked.get("type") == "ChatSession":
        tool = linked.get("tool")
        if tool:
            return f"{tool} chat"

    if node.get("type") == "Convention":
        refs = node.get("source_refs") or []
        if refs:
            return refs[0] if len(refs) == 1 else f"{len(refs)} sources"

    source_type = node.get("source_type")
    source_ref = node.get("source_ref")
    if source_ref and source_type == "commit":
        return f"commit {source_ref[:7]}"
    if source_ref and source_type == "pr":
        return f"PR #{source_ref}"
    return "unknown source"


def _format_content(node: dict) -> str:
    node_type = node.get("type")
    if node_type == "Incident":
        return node.get("what_broke", "")
    if node_type == "Decision":
        return node.get("content", "")
    if node_type == "Deprecation":
        what = node.get("what", "")
        replaced = node.get("replaced_with")
        return f"{what} -> {replaced}" if replaced else what
    if node_type == "Convention":
        return node.get("rule", "")
    if node_type == "UserInstruction":
        return node.get("content", "")
    if node_type == "Correction":
        return f"AI suggested '{node.get('ai_suggested', '')}', user said '{node.get('user_said', '')}'"
    return str(node)


def _format_recall_results(results: list[dict]) -> str:
    nodes = _extract_nodes(results)

    if not nodes:
        answers = [r["answer"] for r in results if "answer" in r]
        if answers:
            return answers[0]
        return "No relevant memory found for this query."

    lines = [
        f"[{node.get('type')}] {_format_content(node)} (from {_format_source(node)})"
        for node in nodes
    ]
    return "\n".join(lines)


@mcp.tool()
async def remember_instruction(
    content: str,
    tool: str = "claude_code",
    project_context: str = "",
    scope: str = "session",
) -> str:
    """
    Remember a user instruction about how they want the AI to behave.
    Use this when the user says things like 'remember that we don't use X' or
    'always prefer Y'. Returns a confirmation message.
    """
    result = await _backend_memory.remember_instruction(content, tool, project_context, scope)
    return f"Remembered: {content} (session {result['session_id']})"


@mcp.tool()
async def capture_correction(
    ai_suggested: str,
    user_said: str,
    reason: str = "",
    tool: str = "claude_code",
    project_context: str = "",
) -> str:
    """
    Capture a moment where the user corrected an AI suggestion.
    Use this when you (the AI) suggested something and the user pushed back with
    a different approach. Store both what you suggested and what they said instead.
    Returns a confirmation message.
    """
    result = await _backend_memory.capture_correction(
        ai_suggested, user_said, reason, tool, project_context
    )
    return f"Correction captured (session {result['session_id']})"


@mcp.tool()
async def recall(query: str, top_k: int = 5) -> str:
    """
    Query the RepoBrain memory graph for anything related to the current task.
    Returns relevant Decisions, Deprecations, Incidents, Conventions, UserInstructions,
    and Corrections. Use this before making assumptions about the codebase or user preferences.
    """
    results = await _backend_memory.search_memory(query, top_k=top_k)
    return _format_recall_results(results)


if __name__ == "__main__":
    print("RepoBrain MCP server starting on stdio transport...", file=sys.stderr)
    mcp.run(transport="stdio")
