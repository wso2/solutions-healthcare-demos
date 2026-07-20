from fastapi import APIRouter

from app.routers import health, predict

all_routers: list[APIRouter] = [
    health.router,
    predict.router,
]
