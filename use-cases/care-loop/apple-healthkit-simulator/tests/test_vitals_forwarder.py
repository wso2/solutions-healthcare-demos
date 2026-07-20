import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.config import Settings
from app.models import Patient, QuantitySample
from app.vitals_forwarder import run_cycle

EXPECTED_BUNDLE_ENTRIES = 1
EXPECTED_PATIENT_COUNT = 2


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


async def test_run_cycle_skips_patients_without_fhir_link(session: Session) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    linked = Patient(mrn="MRN-A", given_name="A", family_name="A", fhir_patient_id="fhir-patient-1")
    unlinked = Patient(mrn="MRN-B", given_name="B", family_name="B")
    session.add(linked)
    session.add(unlinked)
    session.commit()
    session.refresh(linked)

    session.add(
        QuantitySample(
            patient_id=linked.id,
            source_name="Apple Watch",
            quantity_type="HKQuantityTypeIdentifierHeartRate",
            value=72,
            unit="count/min",
            start_date=now - timedelta(minutes=10),
            end_date=now - timedelta(minutes=10),
        )
    )
    session.commit()

    posted = {}

    def handler(request: httpx.Request) -> httpx.Response:
        posted["bundle"] = json.loads(request.content)
        return httpx.Response(200, json={"resourceType": "Bundle", "type": "transaction-response", "entry": []})

    settings = Settings(vitals_target_url="http://downstream.test/fhir/r4")
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await run_cycle(settings, session, client=client)

    assert result.patients_processed == EXPECTED_PATIENT_COUNT
    assert result.patients_forwarded == 1
    assert result.readings_forwarded == 1
    assert result.target_configured is True
    bundle = posted["bundle"]
    assert len(bundle["entry"]) == EXPECTED_BUNDLE_ENTRIES
    assert bundle["entry"][0]["resource"]["subject"] == {"reference": "Patient/fhir-patient-1"}


async def test_run_cycle_builds_bundle_but_skips_post_without_target(session: Session) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    patient = Patient(mrn="MRN-D", given_name="D", family_name="D", fhir_patient_id="fhir-patient-3")
    session.add(patient)
    session.commit()
    session.refresh(patient)

    session.add(
        QuantitySample(
            patient_id=patient.id,
            source_name="Apple Watch",
            quantity_type="HKQuantityTypeIdentifierHeartRate",
            value=72,
            unit="count/min",
            start_date=now - timedelta(minutes=10),
            end_date=now - timedelta(minutes=10),
        )
    )
    session.commit()

    def handler(_request: httpx.Request) -> httpx.Response:
        message = "should not make any HTTP calls without a configured target"
        raise AssertionError(message)

    settings = Settings(vitals_target_url=None)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await run_cycle(settings, session, client=client)

    assert result.target_configured is False
    assert result.patients_forwarded == 1
    assert result.readings_forwarded == 1


async def test_run_cycle_ignores_readings_outside_window(session: Session) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    patient = Patient(mrn="MRN-C", given_name="C", family_name="C", fhir_patient_id="fhir-patient-2")
    session.add(patient)
    session.commit()
    session.refresh(patient)

    session.add(
        QuantitySample(
            patient_id=patient.id,
            source_name="Apple Watch",
            quantity_type="HKQuantityTypeIdentifierHeartRate",
            value=72,
            unit="count/min",
            start_date=now - timedelta(hours=5),
            end_date=now - timedelta(hours=5),
        )
    )
    session.commit()

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"resourceType": "Bundle", "type": "transaction-response", "entry": []})

    settings = Settings(vitals_target_url="http://downstream.test/fhir/r4")
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await run_cycle(settings, session, client=client)

    assert result.patients_forwarded == 0
    assert result.readings_forwarded == 0
