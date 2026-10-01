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

import pytest
from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

HEART_RATE_BPM = 82
UNKNOWN_WORKOUT_ID = 999999


def test_ingest_and_read_quantity_samples(client: TestClient) -> None:
    payload = [
        {
            "source_name": "Apple Watch",
            "quantity_type": "HKQuantityTypeIdentifierHeartRate",
            "value": HEART_RATE_BPM,
            "unit": "count/min",
            "start_date": "2026-06-22T08:01:00Z",
            "end_date": "2026-06-22T08:01:00Z",
        },
    ]

    created = client.post("/quantity-samples", json=payload)
    assert created.status_code == status.HTTP_201_CREATED
    body = created.json()
    assert len(body) == 1
    sample = body[0]
    assert sample["quantity_type"] == "HKQuantityTypeIdentifierHeartRate"
    assert sample["value"] == HEART_RATE_BPM
    assert sample["uuid"]

    listed = client.get("/quantity-samples")
    assert listed.status_code == status.HTTP_200_OK
    assert len(listed.json()) == 1

    by_uuid = client.get(f"/quantity-samples/{sample['uuid']}")
    assert by_uuid.status_code == status.HTTP_200_OK
    assert by_uuid.json()["uuid"] == sample["uuid"]


def test_get_missing_sample_returns_404(client: TestClient) -> None:
    response = client.get("/quantity-samples/does-not-exist")
    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_foreign_keys_are_enforced(client: TestClient) -> None:
    payload = [
        {
            "source_name": "Apple Watch",
            "quantity_type": "HKQuantityTypeIdentifierHeartRate",
            "value": HEART_RATE_BPM,
            "unit": "count/min",
            "start_date": "2026-06-22T08:01:00Z",
            "end_date": "2026-06-22T08:01:00Z",
            "workout_id": UNKNOWN_WORKOUT_ID,
        },
    ]
    # With PRAGMA foreign_keys=ON the dangling workout_id is rejected at commit.
    with pytest.raises(IntegrityError):
        client.post("/quantity-samples", json=payload)
