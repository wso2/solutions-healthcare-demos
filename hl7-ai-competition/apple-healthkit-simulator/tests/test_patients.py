from fastapi import status
from fastapi.testclient import TestClient


def _create_patient(client: TestClient, mrn: str) -> str:
    payload = [{"mrn": mrn, "given_name": "Jane", "family_name": "Doe"}]
    created = client.post("/patients", json=payload)
    assert created.status_code == status.HTTP_201_CREATED
    return created.json()[0]["id"]


def test_samples_scope_to_patient(client: TestClient) -> None:
    patient_a = _create_patient(client, "MRN-A")
    patient_b = _create_patient(client, "MRN-B")

    for patient_id in (patient_a, patient_b):
        payload = [
            {
                "patient_id": patient_id,
                "source_name": "Apple Watch",
                "quantity_type": "HKQuantityTypeIdentifierHeartRate",
                "value": 70,
                "unit": "count/min",
                "start_date": "2026-06-22T08:01:00Z",
                "end_date": "2026-06-22T08:01:00Z",
            },
        ]
        created = client.post("/quantity-samples", json=payload)
        assert created.status_code == status.HTTP_201_CREATED

    scoped = client.get("/quantity-samples", params={"patient_id": patient_a})
    assert scoped.status_code == status.HTTP_200_OK
    body = scoped.json()
    assert len(body) == 1
    assert body[0]["patient_id"] == patient_a


def test_quantity_sample_without_patient_id_still_works(client: TestClient) -> None:
    payload = [
        {
            "source_name": "Apple Watch",
            "quantity_type": "HKQuantityTypeIdentifierHeartRate",
            "value": 70,
            "unit": "count/min",
            "start_date": "2026-06-22T08:01:00Z",
            "end_date": "2026-06-22T08:01:00Z",
        },
    ]
    created = client.post("/quantity-samples", json=payload)
    assert created.status_code == status.HTTP_201_CREATED
    assert created.json()[0]["patient_id"] is None
