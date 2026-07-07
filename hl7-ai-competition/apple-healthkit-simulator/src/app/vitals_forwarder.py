from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import httpx
from pydantic import BaseModel
from sqlmodel import Session, select

from app.config import Settings
from app.models import Patient, QuantitySample

# LOINC code, display text, and UCUM unit code per HealthKit quantity type this
# module forwards as a FHIR Observation.
VITALS_OBSERVATION_CODES = {
    "HKQuantityTypeIdentifierHeartRate": ("8867-4", "Heart rate", "beats/minute", "/min"),
    "HKQuantityTypeIdentifierOxygenSaturation": ("59408-5", "Oxygen saturation by pulse oximetry", "%", "%"),
    "HKQuantityTypeIdentifierRespiratoryRate": ("9279-1", "Respiratory rate", "breaths/minute", "/min"),
    "HKQuantityTypeIdentifierBloodPressureSystolic": ("8480-6", "Systolic blood pressure", "mmHg", "mm[Hg]"),
    "HKQuantityTypeIdentifierBloodPressureDiastolic": ("8462-4", "Diastolic blood pressure", "mmHg", "mm[Hg]"),
}


class CycleResult(BaseModel):
    """Summary of one hourly forward cycle."""

    ran_at: datetime
    window_start: datetime
    window_end: datetime
    patients_processed: int
    patients_forwarded: int
    readings_forwarded: int
    target_configured: bool


def fetch_recent_vitals(session: Session, patient_id: int, since: datetime, until: datetime) -> list[QuantitySample]:
    statement = (
        select(QuantitySample)
        .where(QuantitySample.patient_id == patient_id)
        .where(QuantitySample.start_date >= since)
        .where(QuantitySample.start_date < until)
    )
    return [s for s in session.exec(statement).all() if s.quantity_type in VITALS_OBSERVATION_CODES]


def _as_observation(reading: QuantitySample, fhir_patient_id: str) -> dict:
    code, display, unit, ucum_code = VITALS_OBSERVATION_CODES[reading.quantity_type]
    category_system = "http://terminology.hl7.org/CodeSystem/observation-category"
    # naive start_date is UTC-implicit; isoformat() on it omits tz, which fails strict RFC 3339 parsers.
    effective = reading.start_date if reading.start_date.tzinfo else reading.start_date.replace(tzinfo=UTC)
    return {
        "resourceType": "Observation",
        "status": "final",
        "category": [{"coding": [{"system": category_system, "code": "vital-signs"}]}],
        "code": {"coding": [{"system": "http://loinc.org", "code": code, "display": display}]},
        "subject": {"reference": f"Patient/{fhir_patient_id}"},
        "effectiveDateTime": effective.isoformat(),
        "valueQuantity": {
            "value": reading.value,
            "unit": unit,
            "system": "http://unitsofmeasure.org",
            "code": ucum_code,
        },
    }


def _as_transaction_bundle(readings: list[QuantitySample], fhir_patient_id: str) -> dict:
    return {
        "resourceType": "Bundle",
        "type": "transaction",
        "entry": [
            {"resource": _as_observation(reading, fhir_patient_id), "request": {"method": "POST", "url": "Observation"}}
            for reading in readings
        ],
    }


@asynccontextmanager
async def _client_scope(client: httpx.AsyncClient | None) -> AsyncGenerator[httpx.AsyncClient]:
    if client is not None:
        yield client
        return
    async with httpx.AsyncClient(timeout=30) as owned_client:
        yield owned_client


async def _forward_patient(
    patient: Patient, session: Session, window: tuple[datetime, datetime], settings: Settings, client: httpx.AsyncClient
) -> int:
    if not patient.fhir_patient_id:
        return 0

    since, until = window
    readings = fetch_recent_vitals(session, patient.id, since, until)
    if not readings:
        return 0

    if settings.vitals_target_url:
        bundle = _as_transaction_bundle(readings, patient.fhir_patient_id)
        response = await client.post(settings.vitals_target_url, json=bundle)
        response.raise_for_status()

    return len(readings)


async def run_cycle(settings: Settings, session: Session, client: httpx.AsyncClient | None = None) -> CycleResult:
    """Build a FHIR Observation bundle per patient from the last interval's vitals and forward it downstream."""
    ran_at = datetime.now(UTC)
    window_end = ran_at.replace(tzinfo=None)
    window_start = window_end - timedelta(hours=settings.vitals_forward_interval_hours)

    patients = list(session.exec(select(Patient)).all())
    readings_forwarded = 0
    patients_forwarded = 0

    async with _client_scope(client) as active_client:
        for patient in patients:
            forwarded = await _forward_patient(patient, session, (window_start, window_end), settings, active_client)
            readings_forwarded += forwarded
            patients_forwarded += 1 if forwarded else 0

    return CycleResult(
        ran_at=ran_at,
        window_start=window_start,
        window_end=window_end,
        patients_processed=len(patients),
        patients_forwarded=patients_forwarded,
        readings_forwarded=readings_forwarded,
        target_configured=settings.vitals_target_url is not None,
    )
