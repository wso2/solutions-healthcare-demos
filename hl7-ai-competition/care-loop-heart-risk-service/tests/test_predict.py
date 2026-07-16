from fastapi import status
from fastapi.testclient import TestClient

DEFAULT_THRESHOLD = 0.5

# The nb model is served reject-incomplete: all nine features required; resting_bp / resting_ecg optional, not scored.
FULL_FEATURES = {
    "age": 60,
    "sex": "M",
    "max_hr": 140,
    "chest_pain_type": "ATA",
    "resting_bp": 130,
    "cholesterol": 250,
    "fasting_bs": 0,
    "resting_ecg": "Normal",
    "exercise_angina": "N",
    "oldpeak": 1.5,
    "st_slope": "Flat",
}

# The nine model features only (no optional resting_bp / resting_ecg).
REQUIRED_FEATURES = {k: v for k, v in FULL_FEATURES.items() if k not in ("resting_bp", "resting_ecg")}


def test_predict_returns_probability(client: TestClient) -> None:
    response = client.post("/predict", json=FULL_FEATURES)
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert 0.0 <= body["probability"] <= 1.0
    assert body["prediction"] in (0, 1)
    assert body["threshold"] == DEFAULT_THRESHOLD
    assert body["selected_model"] == "catboost"


def test_predict_thresholds_consistently(client: TestClient) -> None:
    body = client.post("/predict", json=FULL_FEATURES).json()
    expected = int(body["probability"] >= body["threshold"])
    assert body["prediction"] == expected


def test_predict_accepts_required_features_only(client: TestClient) -> None:
    # The two optional, unused fields may be omitted; the nine model features suffice.
    response = client.post("/predict", json=REQUIRED_FEATURES)
    assert response.status_code == status.HTTP_200_OK
    assert 0.0 <= response.json()["probability"] <= 1.0


def test_predict_rejects_unknown_sex(client: TestClient) -> None:
    response = client.post("/predict", json={**FULL_FEATURES, "sex": "X"})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_predict_rejects_bad_chest_pain_type(client: TestClient) -> None:
    response = client.post("/predict", json={**FULL_FEATURES, "chest_pain_type": "TYPICAL"})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_predict_rejects_watch_only_payload(client: TestClient) -> None:
    # The old 3-feature watch payload is now incomplete for the nb model.
    response = client.post("/predict", json={"age": 60, "max_hr": 140, "sex": "M"})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_predict_rejects_missing_required_feature(client: TestClient) -> None:
    payload = {k: v for k, v in REQUIRED_FEATURES.items() if k != "cholesterol"}
    response = client.post("/predict", json=payload)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_predict_rejects_null_required_feature(client: TestClient) -> None:
    response = client.post("/predict", json={**FULL_FEATURES, "st_slope": None})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
