from datetime import datetime

from sqlalchemy import JSON
from sqlmodel import Field

from app.models.base import RecordIdentity, SampleSource


class WorkoutBase(SampleSource):
    workout_activity_type: str = Field(
        index=True,
        description="HealthKit workout activity type, e.g. 'HKWorkoutActivityTypeRunning'.",
    )
    start_date: datetime = Field(index=True)
    end_date: datetime = Field(index=True)
    duration: float = Field(description="Workout duration in seconds.")
    total_energy_burned: float | None = Field(default=None, description="Active energy burned.")
    total_energy_unit: str | None = Field(default=None, description="Unit for total energy, e.g. 'kcal'.")
    total_distance: float | None = Field(default=None, description="Total distance covered.")
    total_distance_unit: str | None = Field(default=None, description="Unit for total distance, e.g. 'm'.")
    events: list = Field(
        default_factory=list,
        sa_type=JSON,
        description="Workout events such as pause, resume, lap, and segment markers.",
    )


class Workout(WorkoutBase, RecordIdentity, table=True):
    __tablename__ = "workout"


class WorkoutCreate(WorkoutBase):
    pass


class WorkoutRead(WorkoutBase, RecordIdentity):
    pass
