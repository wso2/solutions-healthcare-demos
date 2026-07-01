from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.model import get_model
from app.routers import all_routers


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    # Warm the ONNX session at startup so the first request is not slow and a
    # missing or corrupt model fails fast here rather than on first prediction.
    get_model()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        summary="Serves heart-disease risk predictions from Apple Watch signals via an ONNX model.",
        version="0.1.0",
        lifespan=lifespan,
    )
    for router in all_routers:
        app.include_router(router)
    return app


app = create_app()
