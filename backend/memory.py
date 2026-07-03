import asyncio
import sys
from datetime import datetime, timezone

import cognee
from cognee.infrastructure.databases.graph import get_graph_engine
from cognee.infrastructure.engine import DataPoint
from cognee.low_level import setup as cognee_setup
from cognee.modules.retrieval.graph_completion_retriever import GraphCompletionRetriever
from cognee.tasks.storage.add_data_points import add_data_points

from backend.config import GEMINI_API_KEY, GITHUB_TOKEN
from backend.extraction import (
    ExtractionResult,
    extract_from_commits,
    extract_from_prs,
)
from backend.extraction import _model as _gemini_model
from backend.ingestion import GitHubIngestor
from backend.schemas import (
    ChatSession,
    CodeFile,
    Commit,
    Convention,
    Correction,
    Decision,
    Deprecation,
    Engineer,
    Incident,
    PullRequest,
    UserInstruction,
)

cognee.config.set_llm_provider("gemini")
cognee.config.set_llm_model("gemini/gemini-2.5-flash")
cognee.config.set_llm_api_key(GEMINI_API_KEY)
cognee.config.set_embedding_provider("gemini")
cognee.config.set_embedding_model("gemini/gemini-embedding-001")
cognee.config.set_embedding_api_key(GEMINI_API_KEY)

_setup_lock = asyncio.Lock()
_setup_done = False


async def _ensure_cognee_setup() -> None:
    """Initialize Cognee's low-level storage tables once per process.

    Required before add_data_points() can reliably index vectors — confirmed via a
    manual sanity check (add a single Decision, cognify skipped, search via retriever):
    without this, add_data_points() still writes graph nodes, but the vector engine
    fails to register the embedding collection for later retrieval.
    """
    global _setup_done
    if _setup_done:
        return
    async with _setup_lock:
        if _setup_done:
            return
        await cognee_setup()
        _setup_done = True


def commit_to_datapoints(
    commit: dict, result: ExtractionResult, source_commit: Commit
) -> list[DataPoint]:
    """
    Convert an extraction result from a commit into full Cognee DataPoints.
    Uses commit["sha"] as source_ref, commit["timestamp"] as made_on/deprecated_on/date/established_on,
    commit["author_handle"] as made_by_handle, and source_commit as the graph-edge reference
    (must be the same Commit instance already pushed for this commit, so the edge lands on the
    existing node instead of an unrelated duplicate).
    Returns a list of Decision, Deprecation, Incident, and Convention nodes.
    """
    sha = commit["sha"]
    when = commit["timestamp"]
    author = commit.get("author_handle", "unknown")

    datapoints: list[DataPoint] = []

    for d in result.decisions:
        datapoints.append(
            Decision(
                content=d.content,
                made_on=when,
                made_by_handle=author,
                source_type="commit",
                source_ref=sha,
                source_commit=source_commit,
            )
        )
    for d in result.deprecations:
        datapoints.append(
            Deprecation(
                what=d.what,
                why=d.why,
                deprecated_on=when,
                replaced_with=d.replaced_with,
                source_ref=sha,
                source_commit=source_commit,
            )
        )
    for i in result.incidents:
        datapoints.append(
            Incident(
                date=when,
                what_broke=i.what_broke,
                root_cause=i.root_cause,
                files_involved=commit.get("files_touched", []),
                source_ref=sha,
                source_commit=source_commit,
            )
        )
    for c in result.conventions:
        datapoints.append(
            Convention(
                rule=c.rule,
                established_on=when,
                confidence=c.confidence,
                source_refs=[sha],
                source_commit=source_commit,
            )
        )
    return datapoints


def pr_to_datapoints(pr: dict, result: ExtractionResult, source_pr: PullRequest) -> list[DataPoint]:
    """
    Same, but for PRs. Uses str(pr["number"]) as source_ref, pr["author_handle"] as
    made_by_handle, and source_pr as the graph-edge reference (must be the same PullRequest
    instance already pushed for this PR).

    Known limitation: our current fetch_pull_requests() doesn't return a PR timestamp
    (created_at/merged_at), so there's no real "when" to attach to PR-derived nodes.
    We fall back to datetime.now(UTC) as ingestion-time, not event-time. Fix properly
    by adding created_at/merged_at to GitHubIngestor.fetch_pull_requests().
    """
    source_ref = str(pr["number"])
    author = pr.get("author_handle", "unknown")
    when = datetime.now(timezone.utc)  # known limitation, see docstring

    datapoints: list[DataPoint] = []

    for d in result.decisions:
        datapoints.append(
            Decision(
                content=d.content,
                made_on=when,
                made_by_handle=author,
                source_type="pr",
                source_ref=source_ref,
                source_pr=source_pr,
            )
        )
    for d in result.deprecations:
        datapoints.append(
            Deprecation(
                what=d.what,
                why=d.why,
                deprecated_on=when,
                replaced_with=d.replaced_with,
                source_ref=source_ref,
                source_pr=source_pr,
            )
        )
    for i in result.incidents:
        datapoints.append(
            Incident(
                date=when,
                what_broke=i.what_broke,
                root_cause=i.root_cause,
                files_involved=pr.get("files_changed", []),
                source_ref=source_ref,
                source_pr=source_pr,
            )
        )
    for c in result.conventions:
        datapoints.append(
            Convention(
                rule=c.rule,
                established_on=when,
                confidence=c.confidence,
                source_refs=[source_ref],
                source_pr=source_pr,
            )
        )
    return datapoints


def repo_to_datapoints(
    commits: list[dict], prs: list[dict], file_tree: list[dict], repo_full_name: str
) -> tuple[list[DataPoint], dict[tuple[str, str], Commit], dict[tuple[int, str], PullRequest]]:
    """
    Turn raw ingestion output (list of commit dicts, list of PR dicts, list of file dicts)
    into structural Cognee DataPoints: CodeFile, Engineer, Commit, PullRequest.

    Returns (datapoints, commit_by_key, pr_by_key) — keyed by (sha, branch) and
    (number, branch) tuples, not sha/number alone. Multi-branch ingestion can fetch the
    same sha or PR number under more than one branch (e.g. shared history between a
    feature branch and main, within the fetch window); keying on the pair keeps each
    branch's copy addressable as its own instance instead of one silently overwriting
    the other in the lookup dict. Callers (see ingest_repo_into_memory) pass the *same*
    instance into commit_to_datapoints/pr_to_datapoints as source_commit/source_pr, so
    the resulting graph edge points at the node actually pushed rather than a duplicate.

    Engineers are deduplicated by github_handle before returning — Cognee's identity_fields
    already makes re-adding the same Engineer idempotent on its side, but there's no reason
    to construct N duplicate objects in memory when we can dedupe with a dict up front.

    Known limitation: fetch_file_tree() doesn't return a per-file last-modified timestamp
    (would require one extra GitHub API call per file), so CodeFile.last_modified falls
    back to ingestion time rather than the file's actual last commit date.
    """
    datapoints: list[DataPoint] = []
    engineers_by_handle: dict[str, Engineer] = {}
    commit_by_key: dict[tuple[str, str], Commit] = {}
    pr_by_key: dict[tuple[int, str], PullRequest] = {}

    def _touch_engineer(handle: str) -> None:
        if handle and handle not in engineers_by_handle:
            engineers_by_handle[handle] = Engineer(name=handle, github_handle=handle)

    for f in file_tree:
        datapoints.append(
            CodeFile(
                path=f["path"],
                language=f["language"],
                last_modified=datetime.now(timezone.utc),  # known limitation, see docstring
            )
        )

    for commit in commits:
        author = commit.get("author_handle", "unknown")
        branch = commit.get("branch", "")
        _touch_engineer(author)
        commit_datapoint = Commit(
            sha=commit["sha"],
            message=commit["message"],
            author_handle=author,
            timestamp=commit["timestamp"],
            files_touched=commit.get("files_touched", []),
            branch=branch,
        )
        commit_by_key[(commit["sha"], branch)] = commit_datapoint
        datapoints.append(commit_datapoint)

    for pr in prs:
        author = pr.get("author_handle", "unknown")
        branch = pr.get("branch", "")
        _touch_engineer(author)
        for reviewer in pr.get("reviewer_handles", []):
            _touch_engineer(reviewer)
        pr_datapoint = PullRequest(
            number=pr["number"],
            title=pr["title"],
            description=pr.get("description", ""),
            author_handle=author,
            files_changed=pr.get("files_changed", []),
            reviewer_handles=pr.get("reviewer_handles", []),
            merged=pr.get("merged", False),
            branch=branch,
        )
        pr_by_key[(pr["number"], branch)] = pr_datapoint
        datapoints.append(pr_datapoint)

    datapoints.extend(engineers_by_handle.values())
    return datapoints, commit_by_key, pr_by_key


async def ingest_repo_into_memory(
    repo_full_name: str,
    branches: list[str] | None = None,
    commit_limit: int = 20,
    pr_limit: int = 10,
) -> dict:
    """
    End-to-end: fetch from GitHub -> extract via Gemini -> push to Cognee.
    Returns a dict with counts: {'commits': N, 'prs': M, 'decisions': X, ...,
    'branches_ingested': [...], 'commits_per_branch': {...}, 'prs_per_branch': {...}}.

    If branches is None/empty, ingests just the repo's default branch (backward-compatible
    with the original single-branch behavior). If provided, fetches and merges commits/PRs/
    files from every listed branch before pushing one combined graph to Cognee — 'commits',
    'prs', and 'files' in the returned dict are totals across all branches.

    NOTE on Cognee API: cognee.add() + cognee.cognify() is Cognee's pipeline for raw,
    unstructured documents (it chunks text and uses an LLM to extract a graph from it).
    Calling cognee.add() with our own pre-built DataPoint instances raises
    IngestionError: Data type not supported — confirmed via the sanity check requested
    for this task. Since we already have a fully-typed graph (no extraction needed),
    the correct call is the lower-level cognee.tasks.storage.add_data_points.add_data_points(),
    which writes nodes/edges directly to the graph + vector stores. No cognify() step
    is needed or applicable here.
    """
    await _ensure_cognee_setup()

    print(f"Ingesting {repo_full_name} into memory...")
    ingestor = GitHubIngestor(GITHUB_TOKEN, repo_full_name)

    resolved_branches = branches if branches else [ingestor.repo.default_branch]

    all_commits: list[dict] = []
    all_prs: list[dict] = []
    all_file_tree: list[dict] = []
    commits_per_branch: dict[str, int] = {}
    prs_per_branch: dict[str, int] = {}

    for branch in resolved_branches:
        print(f"Ingesting branch '{branch}'...")
        branch_commits = ingestor.fetch_commits(branch=branch, limit=commit_limit)
        branch_prs = ingestor.fetch_pull_requests(base_branch=branch, limit=pr_limit)
        branch_files = ingestor.fetch_file_tree(branch=branch)
        print(
            f"  Fetched {len(branch_commits)} commits, {len(branch_prs)} PRs, "
            f"{len(branch_files)} files"
        )

        all_commits.extend(branch_commits)
        all_prs.extend(branch_prs)
        all_file_tree.extend(branch_files)
        commits_per_branch[branch] = len(branch_commits)
        prs_per_branch[branch] = len(branch_prs)

    print("Extracting memory-worthy signals via Gemini...")
    commit_results = await extract_from_commits(all_commits)
    pr_results = await extract_from_prs(all_prs)

    print("Building Cognee DataPoints...")
    datapoints, commit_by_key, pr_by_key = repo_to_datapoints(
        all_commits, all_prs, all_file_tree, repo_full_name
    )

    counts = {
        "commits": len(all_commits),
        "prs": len(all_prs),
        "files": len(all_file_tree),
        "decisions": 0,
        "deprecations": 0,
        "incidents": 0,
        "conventions": 0,
        "branches_ingested": resolved_branches,
        "commits_per_branch": commits_per_branch,
        "prs_per_branch": prs_per_branch,
    }

    for commit, result in zip(all_commits, commit_results):
        source_commit = commit_by_key[(commit["sha"], commit.get("branch", ""))]
        datapoints.extend(commit_to_datapoints(commit, result, source_commit))
        counts["decisions"] += len(result.decisions)
        counts["deprecations"] += len(result.deprecations)
        counts["incidents"] += len(result.incidents)
        counts["conventions"] += len(result.conventions)

    for pr, result in zip(all_prs, pr_results):
        source_pr = pr_by_key[(pr["number"], pr.get("branch", ""))]
        datapoints.extend(pr_to_datapoints(pr, result, source_pr))
        counts["decisions"] += len(result.decisions)
        counts["deprecations"] += len(result.deprecations)
        counts["incidents"] += len(result.incidents)
        counts["conventions"] += len(result.conventions)

    print(f"Pushing {len(datapoints)} DataPoints into Cognee...")
    await add_data_points(datapoints)

    counts["total_datapoints"] = len(datapoints)

    print("Ingestion complete.")
    return counts


async def remember_instruction(
    content: str,
    tool: str,
    project_context: str = "",
    scope: str = "session",
) -> dict:
    """
    Create a ChatSession + UserInstruction, push both to Cognee.
    Returns {"session_id": ..., "instruction_id": ..., "status": "ok"}.
    Uses datetime.now(UTC) for timestamps. Session_id format: f"{tool}-{iso_timestamp}".

    Known simplification: every call creates its own fresh ChatSession rather than
    reusing one across multiple remember_instruction/capture_correction calls in the
    same real conversation — grouping calls into a shared session would need a session
    id threaded in from the MCP client, which is out of scope here.
    """
    await _ensure_cognee_setup()

    now = datetime.now(timezone.utc)
    session_id = f"{tool}-{now.isoformat()}"

    session = ChatSession(
        session_id=session_id,
        tool=tool,
        started_at=now,
        project_context=project_context,
    )
    instruction = UserInstruction(
        content=content,
        given_at=now,
        scope=scope,
        source_session=session,
    )

    await add_data_points([session, instruction])

    return {"session_id": session_id, "instruction_id": str(instruction.id), "status": "ok"}


async def capture_correction(
    ai_suggested: str,
    user_said: str,
    reason: str,
    tool: str,
    project_context: str = "",
) -> dict:
    """
    Create a ChatSession + Correction, push both to Cognee.
    Returns {"session_id": ..., "correction_id": ..., "status": "ok"}.
    """
    await _ensure_cognee_setup()

    now = datetime.now(timezone.utc)
    session_id = f"{tool}-{now.isoformat()}"

    session = ChatSession(
        session_id=session_id,
        tool=tool,
        started_at=now,
        project_context=project_context,
    )
    correction = Correction(
        ai_suggested=ai_suggested,
        user_said=user_said,
        reason=reason,
        given_at=now,
        source_session=session,
    )

    await add_data_points([session, correction])

    return {"session_id": session_id, "correction_id": str(correction.id), "status": "ok"}


def _summarize_node(node, full_attrs_by_id: dict) -> dict:
    """Build a display dict for a retrieved graph node.

    GraphCompletionRetriever's Node objects (from get_triplets()) carry only a fixed,
    reduced attribute set (name/description/text/importance_weight) meant for LLM-context
    rendering — none of our custom DataPoint fields (content, what_broke, sha, ...) survive
    that projection, and its 'id' attribute is unreliably None. We instead look the node up
    by id in the raw graph engine's data (full_attrs_by_id), which preserves every original
    field, and fall back to the reduced attrs only if the id can't be found there.
    """
    node_id = str(node.id)
    full = full_attrs_by_id.get(node_id)
    if full is not None:
        attrs = {k: v for k, v in full.items() if k != "vector_distance"}
    else:
        attrs = {k: v for k, v in node.attributes.items() if k != "vector_distance"}
    attrs["id"] = node_id
    return attrs


async def search_memory(query: str, top_k: int = 5, branch: str | None = None) -> list[dict]:
    """Thin wrapper over Cognee's retrieval layer for consistency with the rest of the codebase.

    NOTE: cognee.search() is scoped to datasets registered via the cognee.add()/cognify()
    document-ingestion pipeline. Since ingest_repo_into_memory() writes pre-built DataPoints
    directly via add_data_points() (see its docstring for why), cognee.search() can't see
    that data — confirmed via the sanity check (it reported "empty knowledge graph" even
    with a node present). GraphCompletionRetriever queries the graph/vector stores directly
    and reliably finds it instead.

    If branch is given, results are filtered to triplets where either side has that branch
    (Commit/PullRequest carry "branch" directly; Decision/Deprecation/Incident/Convention
    don't have a branch field themselves, but every triplet already pairs them with their
    linked Commit/PullRequest on the *other* side of the same triplet dict via the
    source_commit/source_pr edge — so checking both source and target covers the "semantic
    node whose linked commit/PR is on this branch" case too, with no separate lookup needed).
    """
    retriever = GraphCompletionRetriever(top_k=top_k)
    triplets = await retriever.get_triplets(query)

    graph_engine = await get_graph_engine()
    raw_nodes, _raw_edges = await graph_engine.get_graph_data()
    full_attrs_by_id = {str(node_id): attrs for node_id, attrs in raw_nodes}

    results = []
    for edge in triplets[:top_k]:
        results.append(
            {
                "source": _summarize_node(edge.get_source_node(), full_attrs_by_id),
                "relationship": edge.attributes.get("relationship_name")
                or edge.attributes.get("relationship_type"),
                "target": _summarize_node(edge.get_destination_node(), full_attrs_by_id),
            }
        )

    if branch is not None:

        def matches_branch(triplet: dict) -> bool:
            source = triplet.get("source", {})
            target = triplet.get("target", {})
            return source.get("branch") == branch or target.get("branch") == branch

        results = [r for r in results if matches_branch(r)]

    if not results:
        completions = await retriever.get_completion(query)
        results = [{"answer": c} for c in completions]

    return results


async def get_divergent_branches(query: str, target_branch: str, top_k: int = 5) -> list[str]:
    """
    Given a query and a target branch, return a list of OTHER branches (excluding target_branch)
    that have semantically relevant nodes for this query.
    Used to hint at branch divergence in CLI output.
    Returns an empty list if there's no divergence.
    """
    results = await search_memory(query, top_k=top_k)

    branches: set[str] = set()
    for r in results:
        for key in ("source", "target"):
            node = r.get(key)
            if node and node.get("branch"):
                branches.add(node["branch"])

    branches.discard(target_branch)
    return sorted(branches)


# Node types that carry memory-worthy semantic content (as opposed to structural
# nodes like Commit/PullRequest/CodeFile/Engineer/ChatSession, which only exist to
# anchor semantic nodes to their origin).
SEMANTIC_SOURCE_TYPES = {
    "Decision",
    "Deprecation",
    "Incident",
    "Convention",
    "UserInstruction",
    "Correction",
}


def _extract_semantic_sources(results: list[dict]) -> list[dict]:
    """Flatten search_memory's triplet results into a deduped list of semantic-type nodes.

    Mirrors the node-extraction pattern used by cli/main.py and mcp_server/repobrain.py,
    but dedupes by node "id" (reliable now that _summarize_node always sets it from the
    graph engine's own node id, not the retriever's lossy projection) rather than by
    (type, headline text). Each result is enriched with "_linked_node"/"_relationship" so
    callers can determine commit/PR provenance and branch without a second lookup.
    """
    seen_ids = set()
    sources: list[dict] = []
    for r in results:
        pairs = [(r.get("source"), r.get("target")), (r.get("target"), r.get("source"))]
        for node, other in pairs:
            if not node or node.get("type") not in SEMANTIC_SOURCE_TYPES:
                continue
            node_id = node.get("id")
            if node_id in seen_ids:
                continue
            seen_ids.add(node_id)
            enriched = dict(node)
            enriched["_linked_node"] = other
            enriched["_relationship"] = r.get("relationship")
            sources.append(enriched)
    return sources


def _source_independence_key(node: dict) -> tuple[str, str]:
    """(type, source_ref) pair used to count independent sources.

    Different types are always independent, even with the same source_ref (an
    Incident and a Decision both drawn from PR #292 are 2 independent signals about
    that PR). Same type + same source_ref collapses to one — two Decisions pulled
    from the same PR aren't independent corroboration, they're the same event.
    """
    ref = node.get("source_ref")
    if not ref:
        refs = node.get("source_refs")
        ref = refs[0] if refs else node.get("id", "unknown")
    return (node.get("type", ""), ref)


def _source_text(node: dict) -> str:
    """The primary descriptive text for a semantic node — same field-per-type mapping
    used by cli/main.py's formatter, duplicated here (not imported) so backend doesn't
    depend on cli for its own prompt construction and fallback text."""
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


def _format_source_for_prompt(node: dict) -> str:
    """Compact (~200 char) one-line rendering of a source for the Gemini prompt."""
    node_type = node.get("type", "")
    _, ref = _source_independence_key(node)
    line = f"[{node_type}] {_source_text(node)} (source: {ref})"
    return line[:200]


async def _generate_answer_summary(query: str, sources: list[dict]) -> str:
    """
    Use Gemini Flash to synthesize a one-sentence answer from the sources.
    If Gemini fails or quota exhausted, fall back to the top source's label.
    """
    formatted_sources = "\n".join(f"- {_format_source_for_prompt(s)}" for s in sources)
    prompt = (
        f'A developer asked: "{query}"\n\n'
        "Based on these memory nodes from their team's codebase history:\n"
        f"{formatted_sources}\n\n"
        "Write ONE sentence that directly answers the question. Be specific — mention "
        "file names, PR numbers, or key technical terms if they appear in the sources. "
        "If the sources don't contain a real answer, say so plainly. Do not hedge."
    )

    try:
        response = await _gemini_model.generate_content_async(
            prompt,
            request_options={"timeout": 8},
        )
        text = (response.text or "").strip()
        if text:
            return text
    except Exception as e:
        print(
            f"Answer summary generation failed ({type(e).__name__}: {e}). "
            "Falling back to top source.",
            file=sys.stderr,
        )

    return _source_text(sources[0])


async def search_memory_with_confidence(
    query: str,
    top_k: int = 5,
    branch: str | None = None,
) -> dict:
    """
    Search memory and compute confidence based on source diversity.

    Returns a dict with:
      - "answer": str (one-sentence summary generated by Gemini)
      - "confidence": "HIGH" | "MEDIUM" | "LOW"
      - "confidence_reason": str (why this confidence level)
      - "sources": list[dict] (the underlying results, one per source)
    """
    results = await search_memory(query, top_k=top_k, branch=branch)
    sources = _extract_semantic_sources(results)

    if not sources:
        # search_memory already falls back to a raw LLM completion when no graph
        # triplets matched (see its own docstring) — reuse that instead of paying
        # for a second Gemini call here, so the empty case costs 0 extra calls.
        completions = [r["answer"] for r in results if "answer" in r]
        answer = completions[0] if completions else "No relevant memories found for this question."
        return {
            "answer": answer,
            "confidence": "LOW",
            "confidence_reason": "no relevant memories found",
            "sources": [],
        }

    independent_count = len({_source_independence_key(s) for s in sources})

    if independent_count >= 3:
        confidence = "HIGH"
        confidence_reason = f"{independent_count} independent sources agree"
    elif independent_count == 2:
        confidence = "MEDIUM"
        confidence_reason = "2 independent sources agree"
    else:
        confidence = "LOW"
        confidence_reason = "single source only"

    answer = await _generate_answer_summary(query, sources)

    return {
        "answer": answer,
        "confidence": confidence,
        "confidence_reason": confidence_reason,
        "sources": sources,
    }
