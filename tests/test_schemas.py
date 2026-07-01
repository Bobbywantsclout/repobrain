import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

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

    chat_session = ChatSession(
        session_id="claude_code-2026-07-02T21:00:00",
        tool="claude_code",
        started_at=datetime(2026, 7, 2, 21, 0),
        project_context="repobrain",
    )
    print(chat_session)
    assert chat_session.session_id == "claude_code-2026-07-02T21:00:00"
    assert chat_session.tool == "claude_code"

    user_instruction = UserInstruction(
        content="Always use rich for CLI output, never plain print().",
        given_at=datetime(2026, 7, 2, 21, 5),
        scope="project",
        source_session=chat_session,
    )
    print(user_instruction)
    assert user_instruction.source_session is chat_session
    assert user_instruction.scope == "project"

    correction = Correction(
        ai_suggested="Use cognee.add() + cognee.cognify() to push DataPoints.",
        user_said="Use add_data_points() directly, add()/cognify() rejects custom DataPoints.",
        reason="cognee.add() raised IngestionError: Data type not supported for our DataPoint.",
        given_at=datetime(2026, 7, 2, 21, 10),
        source_session=chat_session,
    )
    print(correction)
    assert correction.source_session is chat_session
    assert correction.ai_suggested.startswith("Use cognee.add()")


if __name__ == "__main__":
    main()
