# care-loop-heart-risk-service

Serves heart-disease risk predictions from Apple Watch / HealthKit signals. FastAPI + ONNX Runtime, managed with uv.

## Model

- CatBoost classifier trained on the wider clinical slice of the Kaggle [heart-failure dataset](https://www.kaggle.com/datasets/fedesoriano/heart-failure-prediction) (CC0, committed at `training/data/heart.csv`) via `notebooks/train.ipynb`, exported to ONNX.
- Preprocessing (label encoding + scaling) is **not** baked into the graph; the service applies the identical transform from a committed `models/preprocessing_nb.json` before scoring, then returns a probability.
- Held-out ROC-AUC is around 0.928.

## Features

The nb model scores nine features.

- **Reject-incomplete**: all nine are required, so an omitted field or an explicit JSON `null` on any of them is a `422`. The caller (care-loop-analysis-service) prefills the full set from FHIR before scoring.
- `resting_bp` and `resting_ecg` are still accepted for contract compatibility but are not consumed by this model.

| Feature | Request field | Type | Required | Source |
| --- | --- | --- | --- | --- |
| `Age` | `age` | number | yes | HealthKit characteristic (date of birth) |
| `Sex` | `sex` | `M`/`F` | yes | HealthKit characteristic |
| `MaxHR` | `max_hr` | number | yes | heart-rate sensor |
| `ChestPainType` | `chest_pain_type` | `TA`/`ATA`/`NAP`/`ASY` | yes | FHIR |
| `Cholesterol` | `cholesterol` | number (mg/dL) | yes | FHIR lab |
| `FastingBS` | `fasting_bs` | `0`/`1` | yes | FHIR lab / diabetes condition |
| `ExerciseAngina` | `exercise_angina` | `Y`/`N` | yes | FHIR |
| `Oldpeak` | `oldpeak` | number | yes | FHIR prior stress test |
| `ST_Slope` | `st_slope` | `Up`/`Flat`/`Down` | yes | FHIR prior stress test |
| `RestingBP` | `resting_bp` | number (mmHg) | no | unused |
| `RestingECG` | `resting_ecg` | `Normal`/`ST`/`LVH` | no | unused |

Target is `HeartDisease` (binary).

## Routes

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness probe |
| `POST` | `/predict` | Score raw watch signals, return probability + label |

Example:

```sh
curl -s http://127.0.0.1:8000/predict \
  -H 'content-type: application/json' \
  -d '{"age": 60, "sex": "M", "max_hr": 140, "chest_pain_type": "ATA",
       "cholesterol": 250, "fasting_bs": 0, "exercise_angina": "N",
       "oldpeak": 1.5, "st_slope": "Flat"}'

# -> {"probability": ..., "prediction": 0, "threshold": 0.5, "selected_model": "catboost"}
```

## Run locally

```sh
uv sync
uv run fastapi dev src/app/main.py
```

API docs at `http://127.0.0.1:8000/docs`. The service loads `models/heart_watch_model_nb.onnx` and `models/preprocessing_nb.json` (both committed) at startup.

## Run with Docker

From the `use-cases/care-loop` root (docker stack):

```sh
make up        # build and start the stack
make ps        # show status
make down      # stop it
```

In the stack the service is published on host port 8002 (container port 8000; see the root `docker-compose.yml`).

## Train

`training/data/heart.csv` is the Kaggle [heart-failure dataset](https://www.kaggle.com/datasets/fedesoriano/heart-failure-prediction), committed here (CC0, so no licensing issue redistributing it) for reproducibility.

The served nb model comes from `notebooks/train.ipynb`, which trains the CatBoost classifier on the wider clinical feature set and writes `models/heart_watch_model_nb.{joblib,onnx}` and `models/metrics_nb.json`. That notebook fits its preprocessing in memory, so the serving transform is regenerated from the committed data with:

```sh
make export-preprocessing   # reproduce preprocessing -> models/preprocessing_nb.json
```

`training/export_preprocessing_nb.py` replays the notebook's imputation, label encoding and scaling on `heart.csv`, writes `models/preprocessing_nb.json`, and asserts it reproduces the notebook matrix and that the ONNX graph matches the joblib pipeline before saving.

The earlier watch-only pipeline is still here for reference:

```sh
make train     # sweep models, evaluate, export ONNX + metrics
```

`training/train.py`:

- Runs 5-fold CV ROC-AUC over a zoo of models (logistic regression, random/extra trees, gradient/hist boosting, SVM, KNN, XGBoost, LightGBM, CatBoost).
- Picks the best by cross-validated AUC, evaluates on a held-out test split.
- Writes `models/heart_watch_model.{joblib,onnx}` with `models/metrics.json`.

The service no longer serves this 3-feature model.

## Develop

From this directory (`care-loop-heart-risk-service/`):

```sh
make lint      # ruff check
make format    # ruff format
make test      # pytest
```

## Notes / current gaps

- The service loads the exported ONNX graph plus `preprocessing_nb.json`, not the joblib pipeline. ONNX/joblib probability parity is ~1e-7 max abs diff on a sample (checked by `make export-preprocessing`), so scores match the joblib model in practice.
- Held-out ROC-AUC is around 0.928; treat the output as a screening signal.
- Reject-incomplete: all nine model features are required, so the caller must supply a complete set (prefilled from FHIR) or the request is a `422`.
- The decision threshold defaults to 0.5 (`HEART_RISK_THRESHOLD` to override).
