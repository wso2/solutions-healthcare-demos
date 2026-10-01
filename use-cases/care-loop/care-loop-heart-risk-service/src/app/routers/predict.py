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
