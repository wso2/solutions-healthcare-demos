from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.config import get_settings
from app.db import get_session
from app.vitals_forwarder import CycleResult, run_cycle

router = APIRouter(prefix="/vitals-cron", tags=["vitals-cron"])


class _State:
    last_result: CycleResult | None = None


state = _State()


@router.get("/status")
def status() -> CycleResult | None:
    return state.last_result


@router.post("/run-now")
async def run_now(session: Annotated[Session, Depends(get_session)]) -> CycleResult:
    state.last_result = await run_cycle(get_settings(), session)
    return state.last_result
