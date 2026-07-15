from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["web"])

_INDEX = Path(__file__).resolve().parent.parent / "static" / "index.html"


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
def index() -> str:
    """Serve the Apple Health simulator control UI."""
    return _INDEX.read_text(encoding="utf-8")
