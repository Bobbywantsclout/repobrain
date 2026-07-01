import asyncio
from datetime import datetime, timezone

import cognee
from cognee.infrastructure.databases.graph import get_graph_engine
from cognee.infrastructure.engine import DataPoint
from cognee.low_level import setup as cognee_setup
from cognee.modules.retrieval.graph_completion_retriever import GraphCompletionRetriever
from cognee.tasks.storage.add_data_points import add_data_points

from backend.config import GEMINI_API_KEY, GITHUB_TOKEN
from backend.extraction import ExtractionResult, extract_from_commits, extract_from_prs
from backend.ingestion import GitHubIngestor
from backend.schemas import (
    CodeFile,
    Commit,
    Convention,
    Decision,
    Deprecation,
    Engineer,
    Incident,
    PullRequest,
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
) -> tuple[list[DataPoint], dict[str, Commit], dict[int, PullRequest]]:
    """
    Turn raw ingestion output (list of commit dicts, list of PR dicts, list of file dicts)
    into structural Cognee DataPoints: CodeFile, Engineer, Commit, PullRequest.

    Returns (datapoints, commit_by_sha, pr_by_number) — the two lookup dicts hand back the
    exact Commit/PullRequest instances just constructed, so callers (see
    ingest_repo_into_memory) can pass the *same* instance into commit_to_datapoints/
    pr_to_datapoints as source_commit/source_pr, making the resulting graph edge point at
    the node actually pushed rather than an equivalent-but-distinct duplicate.

    Engineers are deduplicated by github_handle before returning — Cognee's identity_fields
    already makes re-adding the same Engineer idempotent on its side, but there's no reason
    to construct N duplicate objects in memory when we can dedupe with a dict up front.

    Known limitation: fetch_file_tree() doesn't return a per-file last-modified timestamp
    (would require one extra GitHub API call per file), so CodeFile.last_modified falls
    back to ingestion time rather than the file's actual last commit date.
    """
    datapoints: list[DataPoint] = []
    engineers_by_handle: dict[str, Engineer] = {}
    commit_by_sha: dict[str, Commit] = {}
    pr_by_number: dict[int, PullRequest] = {}

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
        _touch_engineer(author)
        commit_datapoint = Commit(
            sha=commit["sha"],
            message=commit["message"],
            author_handle=author,
            timestamp=commit["timestamp"],
            files_touched=commit.get("files_touched", []),
        )
        commit_by_sha[commit["sha"]] = commit_datapoint
        datapoints.append(commit_datapoint)

    for pr in prs:
        author = pr.get("author_handle", "unknown")
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
        )
        pr_by_number[pr["number"]] = pr_datapoint
        datapoints.append(pr_datapoint)

    datapoints.extend(engineers_by_handle.values())
    return datapoints, commit_by_sha, pr_by_number


async def ingest_repo_into_memory(
    repo_full_name: str,
    commit_limit: int = 20,
    pr_limit: int = 10,
) -> dict:
    """
    End-to-end: fetch from GitHub -> extract via Gemini -> push to Cognee.
    Returns a dict with counts: {'commits': N, 'prs': M, 'decisions': X, ...}

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

    print("Fetching commits, pull requests, and file tree from GitHub...")
    commits = ingestor.fetch_commits(limit=commit_limit)
    prs = ingestor.fetch_pull_requests(limit=pr_limit)
    file_tree = ingestor.fetch_file_tree()

    print("Extracting memory-worthy signals via Gemini...")
    commit_results = await extract_from_commits(commits)
    pr_results = await extract_from_prs(prs)

    print("Building Cognee DataPoints...")
    datapoints, commit_by_sha, pr_by_number = repo_to_datapoints(
        commits, prs, file_tree, repo_full_name
    )

    counts = {
        "commits": len(commits),
        "prs": len(prs),
        "files": len(file_tree),
        "decisions": 0,
        "deprecations": 0,
        "incidents": 0,
        "conventions": 0,
    }

    for commit, result in zip(commits, commit_results):
        source_commit = commit_by_sha[commit["sha"]]
        datapoints.extend(commit_to_datapoints(commit, result, source_commit))
        counts["decisions"] += len(result.decisions)
        counts["deprecations"] += len(result.deprecations)
        counts["incidents"] += len(result.incidents)
        counts["conventions"] += len(result.conventions)

    for pr, result in zip(prs, pr_results):
        source_pr = pr_by_number[pr["number"]]
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


async def search_memory(query: str, top_k: int = 5) -> list[dict]:
    """Thin wrapper over Cognee's retrieval layer for consistency with the rest of the codebase.

    NOTE: cognee.search() is scoped to datasets registered via the cognee.add()/cognify()
    document-ingestion pipeline. Since ingest_repo_into_memory() writes pre-built DataPoints
    directly via add_data_points() (see its docstring for why), cognee.search() can't see
    that data — confirmed via the sanity check (it reported "empty knowledge graph" even
    with a node present). GraphCompletionRetriever queries the graph/vector stores directly
    and reliably finds it instead.
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

    if not results:
        completions = await retriever.get_completion(query)
        results = [{"answer": c} for c in completions]

    return results
