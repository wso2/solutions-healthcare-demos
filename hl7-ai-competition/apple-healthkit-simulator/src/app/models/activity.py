from datetime import date

from sqlmodel import Field

from app.models.base import (
    BiologicalSex,
    BloodType,
    FitzpatrickSkinType,
    RecordIdentity,
    SampleSource,
)


class ActivitySummaryBase(SampleSource):
    date_value: date = Field(index=True, description="Calendar day the summary covers.")
    active_energy_burned: float = Field(default=0.0, description="Move ring value.")
    active_energy_goal: float = Field(default=0.0, description="Move ring goal.")
    active_energy_unit: str = Field(default="kcal", description="Unit for active energy values.")
    exercise_time: float = Field(default=0.0, description="Exercise ring value in minutes.")
    exercise_goal: float = Field(default=0.0, description="Exercise ring goal in minutes.")
    stand_hours: int = Field(default=0, description="Stand ring value in hours.")
    stand_goal: int = Field(default=0, description="Stand ring goal in hours.")


class ActivitySummary(ActivitySummaryBase, RecordIdentity, table=True):
    __tablename__ = "activity_summary"


class ActivitySummaryCreate(ActivitySummaryBase):
    pass


class ActivitySummaryRead(ActivitySummaryBase, RecordIdentity):
    pass


class CharacteristicsBase(SampleSource):
    date_of_birth: date | None = Field(default=None, description="User date of birth.")
    biological_sex: BiologicalSex = Field(default=BiologicalSex.not_set)
    blood_type: BloodType = Field(default=BloodType.not_set)
    fitzpatrick_skin_type: FitzpatrickSkinType = Field(default=FitzpatrickSkinType.not_set)
    wheelchair_use: bool = Field(default=False, description="Whether the user uses a wheelchair.")


class Characteristics(CharacteristicsBase, RecordIdentity, table=True):
    __tablename__ = "characteristics"


class CharacteristicsCreate(CharacteristicsBase):
    pass


class CharacteristicsRead(CharacteristicsBase, RecordIdentity):
    pass
