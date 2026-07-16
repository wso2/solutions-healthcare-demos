from typing import Literal

from pydantic import BaseModel, Field


class HeartRiskRequest(BaseModel):
    """The heart-failure features the model scores.

    The nb model consumes nine features and is served reject-incomplete: all nine
    are required, so an omitted field or an explicit JSON ``null`` on any of them
    is a 422. The caller (care-loop-analysis-service) prefills the full set from
    FHIR before scoring. ``resting_bp`` and ``resting_ecg`` remain optional and are
    accepted but not consumed by this model.

    Categorical spellings match the Kaggle dataset exactly.
    """

    age: float = Field(ge=0, le=120, description="Age in years (HealthKit characteristic).")
    sex: Literal["M", "F"] = Field(description="Biological sex (HealthKit characteristic).")
    max_hr: float = Field(ge=40, le=240, description="Maximum heart rate in bpm (heart-rate sensor).")
    chest_pain_type: Literal["TA", "ATA", "NAP", "ASY"] = Field(
        description="Chest pain type: TA typical angina, ATA atypical, NAP non-anginal, ASY asymptomatic.",
    )
    cholesterol: float = Field(ge=0, le=700, description="Serum cholesterol in mg/dL.")
    fasting_bs: Literal[0, 1] = Field(description="1 if fasting blood sugar > 120 mg/dL, else 0.")
    exercise_angina: Literal["Y", "N"] = Field(description="Exercise-induced angina: Y or N.")
    oldpeak: float = Field(ge=-3, le=7, description="ST depression induced by exercise relative to rest.")
    st_slope: Literal["Up", "Flat", "Down"] = Field(
        description="Slope of the peak exercise ST segment: Up, Flat, or Down."
    )
    resting_bp: float | None = Field(default=None, ge=0, le=250, description="Resting systolic BP (mmHg); unused.")
    resting_ecg: Literal["Normal", "ST", "LVH"] | None = Field(
        default=None, description="Resting ECG (Normal/ST/LVH); unused by this model."
    )


class HeartRiskResponse(BaseModel):
    """Model output: heart-disease probability and the thresholded label."""

    probability: float = Field(description="P(heart disease) in [0, 1].")
    prediction: int = Field(description="1 if probability >= threshold, else 0.")
    threshold: float = Field(description="Decision threshold applied to the probability.")
    selected_model: str = Field(description="Name of the model behind the exported ONNX graph.")
