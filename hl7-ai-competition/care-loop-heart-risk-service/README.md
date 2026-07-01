# care-loop-heart-risk-service

Serves heart-disease risk predictions from Apple Watch / HealthKit signals.
FastAPI + ONNX Runtime, managed with uv.

The model is trained on the slice of the Kaggle
[heart-failure dataset](https://www.kaggle.com/datasets/fedesoriano/heart-failure-prediction)
(CC0, committed at `training/data/heart.csv`) that a watch + HealthKit profile
can actually supply, so it can be scored live from watch data. The winning
pipeline is exported to ONNX with preprocessing baked in; this service loads
that graph and returns a probability.

## Features

Only watch-available signals are kept; everything clinical is dropped.

| Feature | Request field | Watch source |
| --- | --- | --- |
| `Age` | `age` | HealthKit characteristic (date of birth) |
| `Sex` | `sex` | HealthKit characteristic |
| `MaxHR` | `max_hr` | derived from the heart-rate sensor |

Target is `HeartDisease` (binary). With only three features this is a screening
signal, not a diagnosis: the strongest predictors in the full dataset
(`ST_Slope`, `ChestPainType`, `Oldpeak`) are exactly the ones a watch cannot
measure, which sets the ceiling here.

## Routes

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness probe |
| `POST` | `/predict` | Score raw watch signals, return probability + label |

Example:

```sh
curl -s http://127.0.0.1:8000/predict \
  -H 'content-type: application/json' \
  -d '{"age": 60, "max_hr": 140, "sex": "M"}'

# -> {"probability": ..., "prediction": 0, "threshold": 0.5, "selected_model": "xgboost"}
```

## Run locally

```sh
uv sync
uv run fastapi dev src/app/main.py
```

API docs at `http://127.0.0.1:8000/docs`. The service loads
`models/heart_watch_model.onnx` (committed) at startup.

## Run with Docker

From the `hl7-ai-competition` root (docker stack):

```sh
make up        # build and start the stack
make ps        # show status
make down      # stop it
```

## Train

`training/data/heart.csv` is the Kaggle
[heart-failure dataset](https://www.kaggle.com/datasets/fedesoriano/heart-failure-prediction),
committed here (CC0, so no licensing issue redistributing it) for reproducibility.

```sh
make train     # sweep models, evaluate, export ONNX + metrics
```

`training/train.py` runs 5-fold CV ROC-AUC over a zoo of models (logistic
regression, random/extra trees, gradient/hist boosting, SVM, KNN, XGBoost,
LightGBM, CatBoost), picks the best by cross-validated AUC, evaluates on a
held-out test split, and writes `models/heart_watch_model.{joblib,onnx}` with
`models/metrics.json`.

## Develop

From this directory (`care-loop-heart-risk-service/`):

```sh
make lint      # ruff check
make format    # ruff format
make test      # pytest
```

## Notes / current gaps

- This is a very basic first cut; a more thorough version comes later.
- The service loads the exported ONNX graph, not the joblib pipeline. For the
  current XGBoost export the ONNX/sklearn probability parity is ~0.14 max abs
  diff (see `models/metrics.json`), so probabilities approximate the joblib
  model rather than matching it exactly.
- Held-out ROC-AUC is around 0.80; treat the output as a screening signal.
- The decision threshold defaults to 0.5 (`HEART_RISK_THRESHOLD` to override).
