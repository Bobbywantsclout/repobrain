import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from cognee.infrastructure.databases.graph import get_graph_engine

from backend.config import parse_github_repo
from backend.memory import (
    _ensure_cognee_setup,
    forget_memories,
    ingest_repo_into_memory,
    preview_forget,
    search_memory_with_confidence,
)

app = FastAPI(title="RepoBrain")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BRANCH_CARRYING_TYPES = {"Commit", "PullRequest"}


def _truncate(text: str, length: int) -> str:
    text = text or ""
    return text if len(text) <= length else text[: length - 1].rstrip() + "…"


def _compute_label(node_type: str, attrs: dict) -> str:
    if node_type == "Decision":
        return _truncate(attrs.get("content", ""), 60)
    if node_type == "Deprecation":
        return _truncate(attrs.get("what", ""), 60)
    if node_type == "Incident":
        return _truncate(attrs.get("what_broke", ""), 60)
    if node_type == "Convention":
        return _truncate(attrs.get("rule", ""), 60)
    if node_type == "Commit":
        message = attrs.get("message") or ""
        first_line = message.splitlines()[0] if message else ""
        sha = attrs.get("sha") or ""
        return f"{_truncate(first_line, 40)} ({sha[:7]})"
    if node_type == "PullRequest":
        title = attrs.get("title", "")
        number = attrs.get("number", "")
        return f"{_truncate(title, 60)} (#{number})"
    if node_type == "CodeFile":
        return os.path.basename(attrs.get("path") or "")
    if node_type == "Engineer":
        return attrs.get("name") or attrs.get("github_handle") or "Engineer"
    if node_type == "ChatSession":
        return f"{attrs.get('tool', 'unknown')} session"
    if node_type == "UserInstruction":
        return _truncate(attrs.get("content", ""), 60)
    if node_type == "Correction":
        return _truncate(attrs.get("user_said", ""), 60)
    if node_type == "ForgetEvent":
        return _truncate(attrs.get("reason") or attrs.get("query") or "", 60)
    return node_type


@app.get("/health")
async def health():
    try:
        await _ensure_cognee_setup()
        return {"status": "ok", "cognee": "ready"}
    except Exception as e:
        return {"status": "degraded", "error": str(e)}


@app.get("/api/graph")
async def get_graph():
    await _ensure_cognee_setup()
    graph_engine = await get_graph_engine()
    raw_nodes, raw_edges = await graph_engine.get_graph_data()

    attrs_by_id = {str(node_id): attrs for node_id, attrs in raw_nodes}

    # Outgoing-edge index so non-Commit/PullRequest nodes can inherit a branch tag
    # from whatever Commit/PullRequest they reference via source_commit/source_pr.
    outgoing_by_id: dict[str, list[tuple[str, str]]] = {}
    for source_id, target_id, relationship, _props in raw_edges:
        outgoing_by_id.setdefault(str(source_id), []).append((str(target_id), relationship))

    def _resolve_branch(node_id: str, node_type: str, attrs: dict) -> str:
        if node_type in BRANCH_CARRYING_TYPES:
            return attrs.get("branch") or ""
        for target_id, _relationship in outgoing_by_id.get(node_id, []):
            target_attrs = attrs_by_id.get(target_id)
            if target_attrs and target_attrs.get("type") in BRANCH_CARRYING_TYPES:
                branch = target_attrs.get("branch") or ""
                if branch:
                    return branch
        return ""

    nodes = []
    branches_seen: set[str] = set()
    for node_id, attrs in raw_nodes:
        node_id_str = str(node_id)
        node_type = attrs.get("type", "Unknown")
        branch = _resolve_branch(node_id_str, node_type, attrs)
        if branch:
            branches_seen.add(branch)
        nodes.append(
            {
                "id": node_id_str,
                "type": node_type,
                "label": _compute_label(node_type, attrs),
                "branch": branch,
                "attributes": {k: v for k, v in attrs.items() if k != "vector_distance"},
            }
        )

    edges = []
    for source_id, target_id, relationship, _props in raw_edges:
        source_id_str, target_id_str = str(source_id), str(target_id)
        edges.append(
            {
                "id": f"{source_id_str}-{relationship}-{target_id_str}",
                "source": source_id_str,
                "target": target_id_str,
                "relationship": relationship,
            }
        )

    return {
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "branches": sorted(branches_seen),
        },
    }


class IngestRequest(BaseModel):
    repo: str
    branches: list[str] | None = None
    commits: int = 20
    prs: int = 10


@app.post("/api/ingest")
async def ingest_endpoint(req: IngestRequest):
    await _ensure_cognee_setup()
    try:
        repo = parse_github_repo(req.repo)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        counts = await ingest_repo_into_memory(
            repo, branches=req.branches, commit_limit=req.commits, pr_limit=req.prs
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")

    return counts


class AskRequest(BaseModel):
    query: str
    top_k: int = 5
    branch: str | None = None


@app.post("/api/ask")
async def ask_endpoint(req: AskRequest):
    await _ensure_cognee_setup()
    result = await search_memory_with_confidence(req.query, top_k=req.top_k, branch=req.branch)
    return result


class ForgetPreviewRequest(BaseModel):
    query: str
    top_k: int = 20


class ForgetRequest(BaseModel):
    query: str
    reason: str
    top_k: int = 20


@app.post("/api/forget/preview")
async def preview_forget_endpoint(req: ForgetPreviewRequest):
    await _ensure_cognee_setup()
    nodes = await preview_forget(req.query, top_k=req.top_k)
    return {"nodes": nodes, "count": len(nodes)}


@app.post("/api/forget")
async def forget_endpoint(req: ForgetRequest):
    await _ensure_cognee_setup()
    result = await forget_memories(req.query, req.reason, top_k=req.top_k)
    return result
