"""Dev entrypoint:  python run.py   (or: uvicorn neuroforge.main:app --reload)"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run("neuroforge.main:app", host="127.0.0.1", port=8000, reload=True)
