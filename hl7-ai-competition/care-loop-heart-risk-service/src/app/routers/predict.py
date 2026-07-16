from typing import Annotated

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.model import HeartRiskModel, get_model
from app.schemas import HeartRiskRequest, HeartRiskResponse

# Module-level dependency aliases: referencing the types here keeps them runtime symbols for FastAPI, not TYPE_CHECKING.
ModelDep = Annotated[HeartRiskModel, Depends(get_model)]
SettingsDep = Annotated[Settings, Depends(get_settings)]

router = APIRouter(tags=["prediction"])


@router.post("/predict")
def predict(payload: HeartRiskRequest, model: ModelDep, settings: SettingsDep) -> HeartRiskResponse:
    """Score raw watch signals and return the heart-disease probability."""
    probability = model.predict_proba(payload)
    return HeartRiskResponse(
        probability=probability,
        prediction=int(probability >= settings.threshold),
        threshold=settings.threshold,
        selected_model=model.name,
    )
