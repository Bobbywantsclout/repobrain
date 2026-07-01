import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

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


def main():
    code_file = CodeFile(
        path="backend/main.py",
        language="python",
        last_modified=datetime(2026, 6, 1),
        owner_handle="abymathews21",
    )
    print(code_file)

    engineer = Engineer(
        name="Aby Mathews",
        github_handle="abymathews21",
        modules_owned=["backend/memory.py", "backend/ingestion.py"],
    )
    print(engineer)

    commit = Commit(
        sha="a1b2c3d",
        message="Add custom DataPoint schemas",
        author_handle="abymathews21",
        timestamp=datetime(2026, 7, 1, 12, 0),
        files_touched=["backend/schemas.py"],
    )
    print(commit)

    pull_request = PullRequest(
        number=1,
        title="Add Cognee schemas",
        description="Defines custom DataPoints for the code-memory graph.",
        author_handle="abymathews21",
        files_changed=["backend/schemas.py", "tests/test_schemas.py"],
        reviewer_handles=["some-reviewer"],
        merged=True,
    )
    print(pull_request)

    decision = Decision(
        content="Use Cognee DataPoints instead of a custom ORM for the memory layer.",
        made_on=datetime(2026, 6, 15),
        made_by_handle="abymathews21",
        source_type="pr",
        source_ref="1",
        source_pr=pull_request,
    )
    print(decision)
    assert decision.source_pr is pull_request
    assert decision.source_commit is None

    deprecation = Deprecation(
        what="backend/legacy_memory.py",
        why="Replaced by Cognee-based ingestion pipeline.",
        deprecated_on=datetime(2026, 6, 20),
        replaced_with="backend/memory.py",
        source_ref="a1b2c3d",
        source_commit=commit,
    )
    print(deprecation)
    assert deprecation.source_commit is commit
    assert deprecation.source_pr is None

    incident = Incident(
        date=datetime(2026, 6, 25),
        what_broke="Ingestion pipeline crashed on large repos.",
        root_cause="Unbounded memory usage while chunking files.",
        files_involved=["backend/ingestion.py"],
        source_ref="a1b2c3d",
        source_commit=commit,
    )
    print(incident)
    assert incident.source_commit is commit

    convention = Convention(
        rule="All DataPoint subclasses must have a one-line docstring.",
        established_on=datetime(2026, 7, 1),
        confidence=0.9,
        source_refs=["backend/schemas.py", "1"],
        source_pr=pull_request,
    )
    print(convention)
    assert convention.source_pr is pull_request


if __name__ == "__main__":
    main()
