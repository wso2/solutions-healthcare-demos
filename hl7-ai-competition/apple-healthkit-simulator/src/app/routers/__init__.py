from fastapi import APIRouter

from app.models import (
    ActivitySummary,
    ActivitySummaryCreate,
    ActivitySummaryRead,
    CategorySample,
    CategorySampleCreate,
    CategorySampleRead,
    Characteristics,
    CharacteristicsCreate,
    CharacteristicsRead,
    ClinicalRecord,
    ClinicalRecordCreate,
    ClinicalRecordRead,
    Correlation,
    CorrelationCreate,
    CorrelationRead,
    QuantitySample,
    QuantitySampleCreate,
    QuantitySampleRead,
    Workout,
    WorkoutCreate,
    WorkoutRead,
)
from app.routers import health
from app.routers.crud import build_router

quantity_router = build_router(
    prefix="/quantity-samples",
    tag="quantity-samples",
    table_model=QuantitySample,
    create_model=QuantitySampleCreate,
    read_model=QuantitySampleRead,
)

category_router = build_router(
    prefix="/category-samples",
    tag="category-samples",
    table_model=CategorySample,
    create_model=CategorySampleCreate,
    read_model=CategorySampleRead,
)

correlation_router = build_router(
    prefix="/correlations",
    tag="correlations",
    table_model=Correlation,
    create_model=CorrelationCreate,
    read_model=CorrelationRead,
)

workout_router = build_router(
    prefix="/workouts",
    tag="workouts",
    table_model=Workout,
    create_model=WorkoutCreate,
    read_model=WorkoutRead,
)

activity_summary_router = build_router(
    prefix="/activity-summaries",
    tag="activity-summaries",
    table_model=ActivitySummary,
    create_model=ActivitySummaryCreate,
    read_model=ActivitySummaryRead,
)

characteristics_router = build_router(
    prefix="/characteristics",
    tag="characteristics",
    table_model=Characteristics,
    create_model=CharacteristicsCreate,
    read_model=CharacteristicsRead,
)

clinical_router = build_router(
    prefix="/clinical-records",
    tag="clinical-records",
    table_model=ClinicalRecord,
    create_model=ClinicalRecordCreate,
    read_model=ClinicalRecordRead,
)

all_routers: list[APIRouter] = [
    health.router,
    quantity_router,
    category_router,
    correlation_router,
    workout_router,
    activity_summary_router,
    characteristics_router,
    clinical_router,
]
