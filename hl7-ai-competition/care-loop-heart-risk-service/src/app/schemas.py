from typing import Literal

from pydantic import BaseModel, Field


class HeartRiskRequest(BaseModel):
    """Raw Apple Watch / HealthKit signals the model consumes.

    These are the only three features the model was trained on, because they are
    the only ones a watch + HealthKit profile can supply.
    """

    age: float = Field(ge=0, le=120, description="Age in years (HealthKit characteristic).")
    max_hr: float = Field(ge=40, le=240, description="Maximum heart rate in bpm (heart-rate sensor).")
    sex: Literal["M", "F"] = Field(description="Biological sex (HealthKit characteristic).")


class HeartRiskResponse(BaseModel):
    """Model output: heart-disease probability and the thresholded label."""

    probability: float = Field(description="P(heart disease) in [0, 1].")
    prediction: int = Field(description="1 if probability >= threshold, else 0.")
    threshold: float = Field(description="Decision threshold applied to the probability.")
    selected_model: str = Field(description="Name of the model behind the exported ONNX graph.")
