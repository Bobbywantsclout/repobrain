# RepoBrain — Current State

## What it is

A memory layer for AI coding agents built on Cognee. Ingests any public GitHub repo's commits and PRs, uses Gemini Flash to extract typed memory nodes (Decision, Deprecation, Incident, Convention), pushes them into Cognee's knowledge graph, and answers questions about the repo's history.

## What's built

- `backend/schemas.py` — 8 custom Cognee DataPoints with identity_fields for dedup and index_fields for semantic search
- `backend/config.py` — env config, GitHub URL parser
- `backend/ingestion.py` — GitHub API layer via PyGithub, handles auth/rate limits/404s/encoding
- `backend/extraction.py` — Gemini Flash extraction with JSON mode + Pydantic parsing, concurrency-capped batches
- `backend/memory.py` — Cognee integration using add_data_points + GraphCompletionRetriever (NOT add/cognify/search)
- `cli/main.py` — CLI wrapper with `ingest` and `ask` commands, entry point registered as `repobrain` in `pyproject.toml`, both commands working
- Test scripts for each module in `tests/`

## Key architectural decisions

- We use Cognee's low-level add_data_points() API, not add()/cognify(), because we already have fully-typed DataPoints
- Search uses GraphCompletionRetriever directly, not cognee.search() (the latter is scoped to pipeline-ingested datasets)
- Gemini SDK is google-generativeai (deprecated but functional) with JSON mode + manual Pydantic parsing

## Known limitations

- PR timestamps use datetime.now(UTC) fallback (ingestion doesn't fetch PR event timestamps)
- Gemini free tier is 20 requests/day, so full ingestion of >20 commits/PRs will hit quota
- Retriever's default node projection strips custom fields — search_memory works around this by cross-referencing get_graph_data()

## What's next

- MCP server for chat capture (Path A — chat memory + code memory in one graph)
- Sub-task 5: React Flow graph explorer
- Sub-task 6: Forget engine

## Environment

- Python 3.12
- Cognee 1.2.2
- Windows 11
- .env has GEMINI_API_KEY, GITHUB_TOKEN, TEST_REPO=vercel/ms
- google-generativeai printed EOL warning — SDK works but tech debt exists

## Session notes

### 2026-07-02

- Replaced string-based `source_ref` on Decision/Deprecation/Incident/Convention with real object references (`source_commit`/`source_pr`) via Pydantic forward refs + `model_rebuild()`, giving the graph real edges to Commit/PullRequest nodes instead of isolated islands
- Built the CLI wrapper (`cli/main.py`): `repobrain ingest <repo>` and `repobrain ask "<question>"`, argparse + rich output, entry point registered in a new `pyproject.toml`
- Found and fixed three real bugs surfaced by end-to-end testing, not just design work:
  1. `PullRequest.metadata.index_fields` included `number` (an int), which crashed Cognee's vector indexer — moved to `title`
  2. `search_memory`'s node summarization dropped custom DataPoint fields because `GraphCompletionRetriever`'s Node objects project down to a generic `name`/`description`/`text` schema — fixed by cross-referencing `get_graph_data()` for full field values
  3. CLI's source-attribution logic assumed all four semantic types carry `source_type`/`source_ref`, but only Decision does — fixed by deriving commit-vs-PR provenance from the graph edge relationship instead
