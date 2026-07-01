# RepoBrain

A memory layer for AI coding agents.

## Setup

1. Create and activate a virtual environment:
   ```
   python -m venv .venv
   .venv\Scripts\activate      # Windows
   source .venv/bin/activate   # macOS/Linux
   ```
2. Install dependencies:
   ```
   pip install cognee fastapi uvicorn python-dotenv pygithub
   ```
3. Copy `.env.example` to `.env` and fill in your `GEMINI_API_KEY` and `GITHUB_TOKEN`.
4. Run the backend:
   ```
   uvicorn backend.main:app --reload
   ```
