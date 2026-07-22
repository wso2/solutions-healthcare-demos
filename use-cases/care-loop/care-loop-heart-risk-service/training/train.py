from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from catboost import CatBoostClassifier
from lightgbm import LGBMClassifier
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    ExtraTreesClassifier,
    GradientBoostingClassifier,
    HistGradientBoostingClassifier,
    RandomForestClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC
from xgboost import XGBClassifier

RANDOM_STATE = 42

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "training" / "data" / "heart.csv"
MODEL_DIR = ROOT / "models"

NUMERIC_FEATURES = ["Age", "MaxHR"]
CATEGORICAL_FEATURES = ["Sex"]
FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
TARGET = "HeartDisease"


def load_data(path: Path) -> tuple[pd.DataFrame, pd.Series]:
    df = pd.read_csv(path)
    missing = {*FEATURES, TARGET} - set(df.columns)
    if missing:
        raise ValueError(f"Dataset is missing expected columns: {sorted(missing)}")
    return df[FEATURES].copy(), df[TARGET].copy()


def build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), NUMERIC_FEATURES),
            ("cat", OneHotEncoder(drop="if_binary"), CATEGORICAL_FEATURES),
        ],
    )


def model_zoo() -> dict[str, tuple[object, dict]]:
    return {
        "logistic_regression": (
            LogisticRegression(max_iter=2000, random_state=RANDOM_STATE),
            {
                "model__C": [0.01, 0.1, 1.0, 10.0],
                "model__class_weight": [None, "balanced"],
            },
        ),
        "random_forest": (
            RandomForestClassifier(random_state=RANDOM_STATE, n_jobs=-1),
            {
                "model__n_estimators": [200, 400],
                "model__max_depth": [None, 4, 8],
                "model__min_samples_leaf": [1, 5, 10],
            },
        ),
        "extra_trees": (
            ExtraTreesClassifier(random_state=RANDOM_STATE, n_jobs=-1),
            {
                "model__n_estimators": [200, 400],
                "model__max_depth": [None, 6, 12],
                "model__min_samples_leaf": [1, 5],
            },
        ),
        "gradient_boosting": (
            GradientBoostingClassifier(random_state=RANDOM_STATE),
            {
                "model__n_estimators": [150, 300],
                "model__learning_rate": [0.03, 0.1],
                "model__max_depth": [2, 3],
            },
        ),
        "hist_gradient_boosting": (
            HistGradientBoostingClassifier(random_state=RANDOM_STATE),
            {
                "model__learning_rate": [0.03, 0.1],
                "model__max_iter": [200, 400],
                "model__max_depth": [None, 3],
            },
        ),
        "svm_rbf": (
            SVC(kernel="rbf", probability=True, random_state=RANDOM_STATE),
            {
                "model__C": [0.1, 1.0, 10.0],
                "model__gamma": ["scale", "auto"],
            },
        ),
        "knn": (
            KNeighborsClassifier(),
            {
                "model__n_neighbors": [5, 11, 21, 31],
                "model__weights": ["uniform", "distance"],
            },
        ),
        "xgboost": (
            XGBClassifier(
                eval_metric="logloss",
                tree_method="hist",
                random_state=RANDOM_STATE,
                n_jobs=-1,
            ),
            {
                "model__n_estimators": [200, 400],
                "model__max_depth": [2, 3, 4],
                "model__learning_rate": [0.03, 0.1],
                "model__subsample": [0.8, 1.0],
            },
        ),
        "lightgbm": (
            LGBMClassifier(random_state=RANDOM_STATE, n_jobs=1, verbose=-1),
            {
                "model__n_estimators": [200, 400],
                "model__max_depth": [2, 3, 4],
                "model__learning_rate": [0.03, 0.1],
                "model__subsample": [0.8, 1.0],
            },
        ),
        "catboost": (
            CatBoostClassifier(random_state=RANDOM_STATE, verbose=False),
            {
                "model__iterations": [200, 400],
                "model__depth": [2, 3, 4],
                "model__learning_rate": [0.03, 0.1],
            },
        ),
    }


def export_to_onnx(pipeline: Pipeline, sample: pd.DataFrame) -> bytes:
    from onnxmltools.convert.lightgbm.operator_converters.LightGbm import convert_lightgbm
    from onnxmltools.convert.xgboost.operator_converters.XGBoost import convert_xgboost
    from skl2onnx import convert_sklearn, update_registered_converter
    from skl2onnx.common.data_types import FloatTensorType, StringTensorType
    from skl2onnx.common.shape_calculator import calculate_linear_classifier_output_shapes

    update_registered_converter(
        XGBClassifier,
        "XGBoostXGBClassifier",
        calculate_linear_classifier_output_shapes,
        convert_xgboost,
        options={"nocl": [True, False], "zipmap": [True, False, "columns"]},
    )
    update_registered_converter(
        LGBMClassifier,
        "LightGbmLGBMClassifier",
        calculate_linear_classifier_output_shapes,
        convert_lightgbm,
        options={"nocl": [True, False], "zipmap": [True, False, "columns"]},
    )

    initial_types = []
    for col in sample.columns:
        if col in NUMERIC_FEATURES:
            initial_types.append((col, FloatTensorType([None, 1])))
        else:
            initial_types.append((col, StringTensorType([None, 1])))

    onnx_model = convert_sklearn(
        pipeline,
        initial_types=initial_types,
        options={"zipmap": False},
        target_opset={"": 18, "ai.onnx.ml": 3},
    )
    return onnx_model.SerializeToString()


def onnx_proba(onnx_bytes: bytes, X: pd.DataFrame) -> np.ndarray:
    import onnxruntime as ort

    sess = ort.InferenceSession(onnx_bytes, providers=["CPUExecutionProvider"])
    feeds = {}
    for inp in sess.get_inputs():
        col = X[inp.name]
        if col.dtype.kind in "biufc":
            feeds[inp.name] = col.to_numpy(dtype=np.float32).reshape(-1, 1)
        else:
            feeds[inp.name] = col.to_numpy(dtype=object).astype(str).reshape(-1, 1)
    outputs = sess.run(None, feeds)
    proba = next(o for o in outputs if getattr(o, "ndim", 0) == 2 and o.shape[1] == 2)
    return proba[:, 1]


def main() -> None:
    X, y = load_data(DATA_PATH)
    print(f"Loaded {len(X)} rows | features={FEATURES} | positive rate={y.mean():.3f}\n")

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        stratify=y,
        random_state=RANDOM_STATE,
    )
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)

    fitted: dict[str, GridSearchCV] = {}
    print("GridSearchCV (5-fold stratified, ROC-AUC) -- best CV score per model:")
    for name, (estimator, grid) in model_zoo().items():
        search = GridSearchCV(
            Pipeline([("prep", build_preprocessor()), ("model", estimator)]),
            param_grid=grid,
            scoring="roc_auc",
            cv=cv,
            n_jobs=-1,
            refit=True,
        )
        search.fit(X_train, y_train)
        fitted[name] = search
        print(f"  {name:<24} {search.best_score_:.4f}   {search.best_params_}")

    ranking = sorted(fitted.items(), key=lambda kv: kv[1].best_score_, reverse=True)
    best_name, best_search = ranking[0]
    best_pipe = best_search.best_estimator_
    print(f"\nSelected model: {best_name} (CV ROC-AUC={best_search.best_score_:.4f})\n")

    proba = best_pipe.predict_proba(X_test)[:, 1]
    pred = best_pipe.predict(X_test)
    test_metrics = {
        "roc_auc": float(roc_auc_score(y_test, proba)),
        "accuracy": float(accuracy_score(y_test, pred)),
        "precision": float(precision_score(y_test, pred)),
        "recall": float(recall_score(y_test, pred)),
        "f1": float(f1_score(y_test, pred)),
    }
    print("Held-out test metrics:")
    for metric, value in test_metrics.items():
        print(f"  {metric:<10} {value:.4f}")
    print("\nConfusion matrix (rows=true, cols=pred):")
    print(confusion_matrix(y_test, pred))
    print("\n" + classification_report(y_test, pred, digits=3))

    MODEL_DIR.mkdir(exist_ok=True)
    onnx_name, onnx_bytes, onnx_parity = None, None, None
    for name, search in ranking:
        try:
            candidate = export_to_onnx(search.best_estimator_, X_train.head(1))
            diff = float(
                np.max(np.abs(onnx_proba(candidate, X_test) - search.best_estimator_.predict_proba(X_test)[:, 1])),
            )
            onnx_name, onnx_bytes, onnx_parity = name, candidate, diff
            if name != best_name:
                print(f"\nNote: '{best_name}' did not convert to ONNX; exported '{name}' instead.")
            break
        except Exception as exc:  # noqa: BLE001
            print(f"\nONNX export failed for '{name}': {type(exc).__name__}: {exc}")

    model_path = MODEL_DIR / "heart_watch_model.joblib"
    joblib.dump(best_pipe, model_path)
    print(f"\nSaved model -> {model_path}")

    if onnx_bytes is not None:
        onnx_path = MODEL_DIR / "heart_watch_model.onnx"
        onnx_path.write_bytes(onnx_bytes)
        print(
            f"Saved ONNX  -> {onnx_path}  (exported '{onnx_name}', max |sklearn-onnx| prob diff = {onnx_parity:.2e})",
        )
    else:
        print("ONNX export: no candidate model could be converted.")

    metrics_path = MODEL_DIR / "metrics.json"
    metrics_path.write_text(
        json.dumps(
            {
                "selected_model": best_name,
                "features": FEATURES,
                "cv_roc_auc": {name: float(s.best_score_) for name, s in fitted.items()},
                "best_params": {name: s.best_params_ for name, s in fitted.items()},
                "test_metrics": test_metrics,
                "n_train": len(X_train),
                "n_test": len(X_test),
                "onnx_exported_model": onnx_name,
                "onnx_sklearn_parity_max_abs_diff": onnx_parity,
            },
            indent=2,
        ),
    )
    print(f"Saved metrics -> {metrics_path}")


if __name__ == "__main__":
    main()
