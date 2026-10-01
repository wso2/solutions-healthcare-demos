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

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from loguru import logger
from sqlmodel import Session

from app.config import get_settings
from app.db import engine, init_db
from app.routers import all_routers
from app.routers.vitals_cron import state as vitals_cron_state
from app.vitals_forwarder import run_cycle


async def _scheduled_forward_cycle() -> None:
    settings = get_settings()
    try:
        with Session(engine) as session:
            vitals_cron_state.last_result = await run_cycle(settings, session)
        logger.info("vitals forward cycle complete: {}", vitals_cron_state.last_result)
    except Exception:  # noqa: BLE001 - a bad cycle must not kill the scheduler
        logger.exception("scheduled vitals forward cycle failed")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    settings = get_settings()
    init_db()
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        _scheduled_forward_cycle,
        "interval",
        hours=settings.vitals_forward_interval_hours,
        next_run_time=datetime.now(UTC),
    )
    scheduler.start()
    logger.info("apple-healthkit-simulator started")
    yield
    scheduler.shutdown(wait=False)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        summary="Ingests simulated Apple HealthKit data into a local store.",
        version="0.1.0",
        lifespan=lifespan,
    )
    for router in all_routers:
        app.include_router(router)
    return app


app = create_app()
