import json
from functools import lru_cache

import numpy as np
import onnxruntime as ort

from app.config import get_settings
from app.schemas import HeartRiskRequest

# The nb graph takes a dense [N, 9] features tensor of preprocessed values and returns a ZipMap; key 1 is P(disease=1).
_POSITIVE_CLASS = 1

# preprocessing_nb.json feature name (Kaggle column) -> HeartRiskRequest field; keys must cover the same nine features.
_FIELD_BY_FEATURE_NAME = {
    "Age": "age",
    "Sex": "sex",
    "ChestPainType": "chest_pain_type",
    "Cholesterol": "cholesterol",
    "FastingBS": "fasting_bs",
    "MaxHR": "max_hr",
    "ExerciseAngina": "exercise_angina",
    "Oldpeak": "oldpeak",
    "ST_Slope": "st_slope",
}


class HeartRiskModel:
    """Thin wrapper over an ONNX Runtime session for the nb heart-risk pipeline."""

    def __init__(self, session: ort.InferenceSession, preprocessing: dict, name: str) -> None:
        """Store the ONNX session, the preprocessing artifact, and the source model name."""
        self._session = session
        self._input_name = session.get_inputs()[0].name
        self._feature_order = preprocessing["feature_order"]
        self._features = preprocessing["features"]
        self.name = name

    def _encode(self, feature_name: str, value: object) -> float:
        """Apply the feature's baked transform (from preprocessing_nb.json) to one value."""
        spec = self._features[feature_name]
        kind = spec["type"]
        if kind == "label":
            # Categoricals were LabelEncoded to their sorted-class index at training.
            return float(spec["classes"].index(str(value)))
        if kind == "standard":
            return (float(value) - spec["mean"]) / spec["scale"]
        if kind == "minmax":
            return (float(value) - spec["data_min"]) / spec["data_range"]
        return float(value)  # passthrough (FastingBS is already 0/1)

    def predict_proba(self, request: HeartRiskRequest) -> float:
        """Return P(heart disease = 1) for one fully-specified feature set.

        The request is validated reject-incomplete, so every model feature is
        present. Values are transformed with the training-time preprocessing baked
        into ``preprocessing_nb.json`` (label encoding, standard/min-max scaling),
        packed into the graph's single ``[1, 9]`` input in ``feature_order``, and
        the positive-class probability is read from the ZipMap output.
        """
        row = [self._encode(name, getattr(request, _FIELD_BY_FEATURE_NAME[name])) for name in self._feature_order]
        feeds = {self._input_name: np.array([row], dtype=np.float32)}

        outputs = self._session.run(None, feeds)
        probabilities = next(o for o in outputs if isinstance(o, list))
        return float(probabilities[0][_POSITIVE_CLASS])


@lru_cache
def get_model() -> HeartRiskModel:
    """Load and cache the ONNX model, its preprocessing artifact, and the source model name."""
    settings = get_settings()
    session = ort.InferenceSession(str(settings.model_path), providers=["CPUExecutionProvider"])
    preprocessing = json.loads(settings.preprocessing_path.read_text())
    name = "unknown"
    if settings.metrics_path.exists():
        metrics = json.loads(settings.metrics_path.read_text())
        name = str(metrics.get("onnx_exported_model") or metrics.get("selected_model") or name)
    return HeartRiskModel(session=session, preprocessing=preprocessing, name=name)
