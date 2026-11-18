# This app has moved off Vercel. Every request gets a plain "moved" page
# and nothing here can reach the database.
from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
async def gone(request: Request, path: str = ""):
    return PlainTextResponse("This app has moved and is no longer available here.", status_code=410)
