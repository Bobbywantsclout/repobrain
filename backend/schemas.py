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
    metadata: dict = {"index_fields": ["sha"], "identity_fields": ["sha"]}


class PullRequest(DataPoint):
    """A GitHub pull request."""

    number: int
    title: str
    description: str
    author_handle: str
    files_changed: list[str] = []
    reviewer_handles: list[str] = []
    merged: bool = False
    # TODO(scale): identity_fields collides across repos — add repo_name field if we ever support multi-repo ingestion
    # index_fields must be string fields (Cognee embeds them as text) — "number" is an int
    # and breaks vector indexing, so we index "title" instead; identity stays on "number".
    metadata: dict = {"index_fields": ["title"], "identity_fields": ["number"]}


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


# Decision/Deprecation/Incident/Convention reference Commit and PullRequest via forward
# (string) type annotations so the schema reads top-to-bottom without needing the four
# semantic classes reordered above the two structural ones. Pydantic v2 requires an
# explicit rebuild to resolve these forward refs against the module's namespace.
Decision.model_rebuild()
Deprecation.model_rebuild()
Incident.model_rebuild()
Convention.model_rebuild()
