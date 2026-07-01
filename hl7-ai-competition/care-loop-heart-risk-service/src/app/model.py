import json
from functools import lru_cache

import numpy as np
import onnxruntime as ort

from app.config import get_settings
from app.schemas import HeartRiskRequest

# The classifier output is an [N, 2] probability tensor; column 1 is P(class=1).
_PROBA_NDIM = 2
_PROBA_COLUMNS = 2
_POSITIVE_CLASS = 1


class HeartRiskModel:
    """Thin wrapper over an ONNX Runtime session for the heart-risk pipeline."""

    def __init__(self, session: ort.InferenceSession, name: str) -> None:
        """Store the ONNX session and the name of the exported source model."""
        self._session = session
        self.name = name

    def predict_proba(self, request: HeartRiskRequest) -> float:
        """Return P(heart disease = 1) for one raw watch feature set.

        Args:
            request: Validated Age/MaxHR/Sex signals. Preprocessing (scaling,
                one-hot encoding) is baked into the ONNX graph.

        Returns:
            The positive-class probability in ``[0, 1]``.
        """
        feeds: dict[str, np.ndarray] = {
            "Age": np.array([[request.age]], dtype=np.float32),
            "MaxHR": np.array([[request.max_hr]], dtype=np.float32),
            "Sex": np.array([[request.sex]], dtype=object),
        }
        outputs = self._session.run(None, feeds)
        proba = next(o for o in outputs if getattr(o, "ndim", 0) == _PROBA_NDIM and o.shape[1] == _PROBA_COLUMNS)
        return float(proba[0, _POSITIVE_CLASS])


@lru_cache
def get_model() -> HeartRiskModel:
    """Load and cache the ONNX model plus the name of the model it was exported from."""
    settings = get_settings()
    session = ort.InferenceSession(str(settings.model_path), providers=["CPUExecutionProvider"])
    name = "unknown"
    if settings.metrics_path.exists():
        metrics = json.loads(settings.metrics_path.read_text())
        name = str(metrics.get("onnx_exported_model") or metrics.get("selected_model") or name)
    return HeartRiskModel(session=session, name=name)
