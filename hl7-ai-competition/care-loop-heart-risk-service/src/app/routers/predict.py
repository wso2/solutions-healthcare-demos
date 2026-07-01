from typing import Annotated

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.model import HeartRiskModel, get_model
from app.schemas import HeartRiskRequest, HeartRiskResponse

# Module-level dependency aliases: referencing the types here (not only in a
# function annotation) keeps them runtime symbols, so FastAPI can resolve them
# and ruff does not push them into a TYPE_CHECKING block.
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
