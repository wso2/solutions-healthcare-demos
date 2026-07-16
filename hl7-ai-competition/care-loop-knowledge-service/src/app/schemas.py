from pydantic import BaseModel, Field


class GuidelineHit(BaseModel):
    """A clinician-facing retrieval result from the HFrEF guideline corpus."""

    text: str = Field(description="The retrieved guideline / reference passage.")
    source: str = Field(description="Source id, e.g. 'statpearls-heart-failure'.")
    section: str = Field(description="Heading or section the passage came from.")
    citation: str = Field(description="Human-readable citation string to quote back to the clinician.")
    score: float = Field(description="Similarity score in [0, 1]; higher is closer to the query.")


class EducationHit(BaseModel):
    """A patient-facing retrieval result from the plain-language education corpus."""

    text: str = Field(description="The retrieved plain-language education passage.")
    source: str = Field(description="Source id, e.g. 'medlineplus-heart-failure'.")
    citation: str = Field(description="Human-readable citation string to attribute the wording.")
    reading_level: str = Field(description="Coarse readability band: 'plain' or 'basic'.")


class FeatureDefinition(BaseModel):
    """A static definition of one Kaggle heart-failure feature."""

    feature: str = Field(description="Canonical feature name, e.g. 'ChestPainType'.")
    definition: str = Field(description="Plain-language explanation of what the feature measures.")
    values: str = Field(description="Allowed values / units and what they mean.")
    model_usage: str = Field(description="How the deployed model uses this feature.")
