from fastapi import status
from fastapi.testclient import TestClient

DEFAULT_THRESHOLD = 0.5


def test_predict_returns_probability(client: TestClient) -> None:
    response = client.post("/predict", json={"age": 60, "max_hr": 140, "sex": "M"})
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert 0.0 <= body["probability"] <= 1.0
    assert body["prediction"] in (0, 1)
    assert body["threshold"] == DEFAULT_THRESHOLD
    assert body["selected_model"]


def test_predict_thresholds_consistently(client: TestClient) -> None:
    body = client.post("/predict", json={"age": 70, "max_hr": 110, "sex": "M"}).json()
    expected = int(body["probability"] >= body["threshold"])
    assert body["prediction"] == expected


def test_predict_rejects_unknown_sex(client: TestClient) -> None:
    response = client.post("/predict", json={"age": 60, "max_hr": 140, "sex": "X"})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
