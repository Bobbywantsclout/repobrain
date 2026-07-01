from fastapi import FastAPI

app = FastAPI(title="RepoBrain")


@app.get("/health")
def health():
    return {"status": "ok"}
