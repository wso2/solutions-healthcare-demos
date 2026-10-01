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
async def run_now(
    session: Annotated[Session, Depends(get_session)],
    patient_uuid: str | None = None,
) -> CycleResult:
    uuids = [patient_uuid] if patient_uuid else None
    state.last_result = await run_cycle(get_settings(), session, patient_uuids=uuids)
    return state.last_result
