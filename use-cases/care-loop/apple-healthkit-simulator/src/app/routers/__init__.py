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

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
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
    Patient,
    PatientCreate,
    PatientRead,
    QuantitySample,
    QuantitySampleCreate,
    QuantitySampleRead,
    Workout,
    WorkoutCreate,
    WorkoutRead,
)
from app.routers import health, vitals_cron, web
from app.routers.crud import build_router

patient_router = build_router(
    prefix="/patients",
    tag="patients",
    table_model=Patient,
    create_model=PatientCreate,
    read_model=PatientRead,
)


class FhirLink(BaseModel):
    fhir_patient_id: str


@patient_router.patch("/{uuid}/fhir-link", response_model=PatientRead)
def link_fhir_patient(uuid: str, link: FhirLink, session: Annotated[Session, Depends(get_session)]) -> Patient:
    patient = session.exec(select(Patient).where(Patient.uuid == uuid)).first()
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"patient '{uuid}' not found")
    patient.fhir_patient_id = link.fhir_patient_id
    session.add(patient)
    session.commit()
    session.refresh(patient)
    return patient


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
    web.router,
    health.router,
    vitals_cron.router,
    patient_router,
    quantity_router,
    category_router,
    correlation_router,
    workout_router,
    activity_summary_router,
    characteristics_router,
    clinical_router,
]
