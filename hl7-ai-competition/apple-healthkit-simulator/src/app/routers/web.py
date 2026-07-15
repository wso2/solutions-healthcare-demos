from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse

router = APIRouter(tags=["web"])

_STATIC = Path(__file__).resolve().parent.parent / "static"
_INDEX = _STATIC / "index.html"
_FAVICON = _STATIC / "favicon.svg"


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
def index() -> str:
    """Serve the Apple Health simulator control UI."""
    return _INDEX.read_text(encoding="utf-8")


@router.get("/favicon.svg", include_in_schema=False)
def favicon() -> FileResponse:
    """Serve the Apple Health styled favicon."""
    return FileResponse(_FAVICON, media_type="image/svg+xml")
