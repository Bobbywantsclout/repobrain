from datetime import datetime

from cognee.infrastructure.engine import DataPoint


class CodeFile(DataPoint):
    """A source code file in the repository."""

    path: str
    language: str
    last_modified: datetime
    owner_handle: str | None = None
    is_deprecated: bool = False
    metadata: dict = {"index_fields": ["path"], "identity_fields": ["path"]}


class Engineer(DataPoint):
    """A person who has contributed to the codebase."""

    name: str
    github_handle: str
    modules_owned: list[str] = []
    metadata: dict = {"index_fields": ["github_handle"], "identity_fields": ["github_handle"]}


class Commit(DataPoint):
    """A Git commit."""

    sha: str
    message: str
    author_handle: str
    timestamp: datetime
    files_touched: list[str] = []
    # Included in identity_fields (not just sha) because a cherry-picked or rebased
    # commit can share a sha across branches, or get a new sha for "the same" change —
    # keying identity on (sha, branch) tracks each branch's copy as its own memory node.
    branch: str = ""
    metadata: dict = {"index_fields": ["message"], "identity_fields": ["sha", "branch"]}


class PullRequest(DataPoint):
    """A GitHub pull request."""

    number: int
    title: str
    description: str
    author_handle: str
    files_changed: list[str] = []
    reviewer_handles: list[str] = []
    merged: bool = False
    # The base branch this PR targets (not its head/source branch).
    branch: str = ""
    # TODO(scale): identity_fields collides across repos — add repo_name field if we ever support multi-repo ingestion
    # index_fields must be string fields (Cognee embeds them as text) — "number" is an int
    # and breaks vector indexing, so we index "title" instead; identity stays on "number".
    metadata: dict = {"index_fields": ["title"], "identity_fields": ["number", "branch"]}


class Decision(DataPoint):
    """An architectural or engineering decision extracted from commits, PRs, ADRs, or discussions."""

    content: str
    made_on: datetime
    made_by_handle: str
    source_type: str
    source_ref: str
    # Exactly one of source_commit / source_pr should be populated per Decision —
    # a Decision comes from either a commit or a PR, never both. Not enforced at
    # runtime, kept simple by convention (see backend/memory.py's conversion functions).
    source_commit: "Commit | None" = None
    source_pr: "PullRequest | None" = None
    metadata: dict = {"index_fields": ["content"], "identity_fields": ["source_ref", "made_on"]}


class Deprecation(DataPoint):
    """Something that was removed or is no longer preferred."""

    what: str
    why: str
    deprecated_on: datetime
    replaced_with: str | None = None
    source_ref: str
    # Exactly one of source_commit / source_pr should be populated per Deprecation.
    source_commit: "Commit | None" = None
    source_pr: "PullRequest | None" = None
    metadata: dict = {"index_fields": ["what", "why"], "identity_fields": ["what", "source_ref"]}


class Incident(DataPoint):
    """A production issue or bug."""

    date: datetime
    what_broke: str
    root_cause: str
    files_involved: list[str] = []
    source_ref: str
    # Exactly one of source_commit / source_pr should be populated per Incident.
    source_commit: "Commit | None" = None
    source_pr: "PullRequest | None" = None
    metadata: dict = {"index_fields": ["what_broke", "root_cause"], "identity_fields": ["source_ref"]}


class Convention(DataPoint):
    """A coding convention or pattern the team follows."""

    rule: str
    established_on: datetime
    confidence: float = 0.5
    source_refs: list[str] = []
    # Exactly one of source_commit / source_pr should be populated per Convention
    # (source_refs still holds the full string-ref history for multi-source cases).
    source_commit: "Commit | None" = None
    source_pr: "PullRequest | None" = None
    metadata: dict = {"index_fields": ["rule"], "identity_fields": ["rule"]}


class ChatSession(DataPoint):
    """A conversation session with an AI coding tool."""

    session_id: str
    tool: str
    started_at: datetime
    project_context: str = ""
    metadata: dict = {"index_fields": ["project_context"], "identity_fields": ["session_id"]}


class UserInstruction(DataPoint):
    """An explicit user instruction to the AI about what to remember or prefer."""

    content: str
    given_at: datetime
    scope: str
    source_session: "ChatSession | None" = None
    metadata: dict = {"index_fields": ["content"], "identity_fields": ["content", "given_at"]}


class Correction(DataPoint):
    """A moment where the user corrected the AI's suggestion."""

    ai_suggested: str
    user_said: str
    reason: str = ""
    given_at: datetime
    source_session: "ChatSession | None" = None
    metadata: dict = {"index_fields": ["user_said"], "identity_fields": ["user_said", "given_at"]}


class ForgetEvent(DataPoint):
    """A record of memories deliberately removed from the graph."""

    query: str  # what the user searched for
    reason: str  # why they chose to forget
    forgotten_at: datetime
    removed_node_ids: list[str]  # UUIDs of removed nodes
    removed_types: list[str]  # e.g. ["Decision", "Deprecation"]
    removed_count: int  # convenience field

    metadata: dict = {
        "index_fields": ["query", "reason"],
        "identity_fields": ["query", "forgotten_at"],
    }


# Decision/Deprecation/Incident/Convention reference Commit and PullRequest via forward
# (string) type annotations so the schema reads top-to-bottom without needing the four
# semantic classes reordered above the two structural ones. Pydantic v2 requires an
# explicit rebuild to resolve these forward refs against the module's namespace.
Decision.model_rebuild()
Deprecation.model_rebuild()
Incident.model_rebuild()
Convention.model_rebuild()

# UserInstruction/Correction reference ChatSession the same way.
ChatSession.model_rebuild()
UserInstruction.model_rebuild()
Correction.model_rebuild()

ForgetEvent.model_rebuild()
