"""Derive the nb model's preprocessing parameters for the serving path.

notebooks/train.ipynb fit its LabelEncoder / StandardScaler / MinMaxScaler in
memory and saved only the classifier, so the transformers the exported
heart_watch_model_nb.onnx expects on its inputs exist nowhere on disk. This
reproduces that preprocessing on training/data/heart.csv and writes
models/preprocessing_nb.json, letting the service apply the identical transform
at request time with plain numpy (no pandas/sklearn in the serving image).

Run: make export-preprocessing  (uv run --extra train python ...).
"""

import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import pandas as pd
from sklearn.preprocessing import LabelEncoder, MinMaxScaler, StandardScaler

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "training" / "data" / "heart.csv"
MODELS = ROOT / "models"

# Mirrors the notebook exactly: LabelEncoder on these categoricals (RestingECG is
# encoded there too but then dropped), StandardScaler on Age/Cholesterol/MaxHR,
# MinMaxScaler on Oldpeak, and HeartDisease/RestingBP/RestingECG dropped from the
# feature matrix. FastingBS is already 0/1 and passes through untransformed.
LABEL_COLS = ["Sex", "ChestPainType", "RestingECG", "ExerciseAngina", "ST_Slope"]
STANDARD_COLS = ["Age", "Cholesterol", "MaxHR"]
MINMAX_COLS = ["Oldpeak"]
DROP_COLS = ["HeartDisease", "RestingBP", "RestingECG"]

POSITIVE_CLASS = 1


def build_artifact() -> tuple[dict, pd.DataFrame]:
    """Reproduce the notebook preprocessing and return (artifact, preprocessed df)."""
    data = pd.read_csv(DATA)
    for c in ["Cholesterol", "RestingBP"]:
        data[c] = data[c].replace(0, np.nan)
        data[c] = data[c].fillna(data[c].median())
    data = data.drop_duplicates().reset_index(drop=True)

    df1 = data.copy(deep=True)

    label_classes: dict[str, list[str]] = {}
    for c in LABEL_COLS:
        le = LabelEncoder()
        df1[c] = le.fit_transform(df1[c])
        label_classes[c] = [str(v) for v in le.classes_]

    standard: dict[str, dict[str, float]] = {}
    for c in STANDARD_COLS:
        ss = StandardScaler()
        df1[c] = ss.fit_transform(df1[[c]])
        standard[c] = {"mean": float(ss.mean_[0]), "scale": float(ss.scale_[0])}

    minmax: dict[str, dict[str, float]] = {}
    for c in MINMAX_COLS:
        mms = MinMaxScaler()
        df1[c] = mms.fit_transform(df1[[c]])
        minmax[c] = {"data_min": float(mms.data_min_[0]), "data_range": float(mms.data_range_[0])}

    feature_order = list(df1.columns.drop(DROP_COLS))

    features: dict[str, dict] = {}
    for c in feature_order:
        if c in label_classes:
            features[c] = {"type": "label", "classes": label_classes[c]}
        elif c in standard:
            features[c] = {"type": "standard", **standard[c]}
        elif c in minmax:
            features[c] = {"type": "minmax", **minmax[c]}
        else:
            features[c] = {"type": "passthrough"}

    return {"feature_order": feature_order, "features": features}, df1[feature_order]


def onnx_proba(session: ort.InferenceSession, matrix: np.ndarray) -> np.ndarray:
    """P(class=1) for each row via the exported nb ONNX graph (ZipMap output)."""
    feeds = {session.get_inputs()[0].name: matrix.astype(np.float32)}
    outputs = session.run(None, feeds)
    zipmap = next(o for o in outputs if isinstance(o, list))
    return np.array([row[POSITIVE_CLASS] for row in zipmap])


def apply_artifact(artifact: dict, raw: pd.DataFrame) -> np.ndarray:
    """Transform raw rows using only the JSON artifact, matching the service path."""
    order = artifact["feature_order"]
    out = np.empty((len(raw), len(order)), dtype=np.float64)
    for j, name in enumerate(order):
        spec = artifact["features"][name]
        col = raw[name]
        if spec["type"] == "label":
            index = {v: i for i, v in enumerate(spec["classes"])}
            out[:, j] = [index[str(v)] for v in col]
        elif spec["type"] == "standard":
            out[:, j] = (col.to_numpy(dtype=float) - spec["mean"]) / spec["scale"]
        elif spec["type"] == "minmax":
            out[:, j] = (col.to_numpy(dtype=float) - spec["data_min"]) / spec["data_range"]
        else:
            out[:, j] = col.to_numpy(dtype=float)
    return out


def main() -> None:
    artifact, preprocessed = build_artifact()
    out_path = MODELS / "preprocessing_nb.json"
    out_path.write_text(json.dumps(artifact, indent=2) + "\n")
    print(f"wrote {out_path}")
    print(f"feature_order: {artifact['feature_order']}")

    # Parity 1: reproducing the preprocessing from the JSON artifact alone (raw
    # heart.csv rows -> imputed) must match the notebook-preprocessed matrix.
    raw = pd.read_csv(DATA)
    for c in ["Cholesterol", "RestingBP"]:
        raw[c] = raw[c].replace(0, np.nan)
        raw[c] = raw[c].fillna(raw[c].median())
    raw = raw.drop_duplicates().reset_index(drop=True)
    from_artifact = apply_artifact(artifact, raw)
    transform_diff = float(np.max(np.abs(from_artifact - preprocessed.to_numpy(dtype=float))))
    print(f"artifact-vs-notebook transform max abs diff: {transform_diff:.3e}")
    assert transform_diff < 1e-9, "artifact transform does not reproduce notebook preprocessing"

    # Parity 2: nb ONNX served over the artifact-preprocessed vectors must match
    # the joblib pipeline's probabilities (spot check on a sample of rows).
    import joblib

    clf = joblib.load(MODELS / "heart_watch_model_nb.joblib")
    session = ort.InferenceSession(str(MODELS / "heart_watch_model_nb.onnx"), providers=["CPUExecutionProvider"])
    sample = from_artifact[:50]
    joblib_proba = clf.predict_proba(sample)[:, POSITIVE_CLASS]
    onnx_p = onnx_proba(session, sample)
    proba_diff = float(np.max(np.abs(joblib_proba - onnx_p)))
    print(f"onnx-vs-joblib probability max abs diff (n=50): {proba_diff:.3e}")


if __name__ == "__main__":
    main()
