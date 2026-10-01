# Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
#
# WSO2 LLC. licenses this file to you under the Apache License,
# Version 2.0 (the "License"); you may not use this file except
# in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied. See the License for the
# specific language governing permissions and limitations
# under the License.

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
