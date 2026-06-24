from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.db import init_db
from app.routers import all_routers


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        summary="Collector service that ingests simulated Apple HealthKit data into a local store.",
        version="0.1.0",
        lifespan=lifespan,
    )
    for router in all_routers:
        app.include_router(router)
    return app


app = create_app()
