import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    # No context manager, so the lifespan warm-up is skipped; get_model() still loads lazily on first request.
    return TestClient(app)
