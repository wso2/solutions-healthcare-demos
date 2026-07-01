from datetime import datetime

from sqlmodel import Field

from app.models.base import RecordIdentity, SampleSource


class QuantitySampleBase(SampleSource):
    patient_id: int | None = Field(default=None, foreign_key="patient.id", index=True)
    quantity_type: str = Field(
        index=True,
        description="HealthKit quantity identifier, e.g. 'HKQuantityTypeIdentifierHeartRate'.",
    )
    value: float = Field(description="Numeric measurement value.")
    unit: str = Field(description="Unit string, e.g. 'count/min'.")
    start_date: datetime = Field(index=True)
    end_date: datetime = Field(index=True)
    correlation_id: int | None = Field(default=None, foreign_key="correlation.id", index=True)
    workout_id: int | None = Field(default=None, foreign_key="workout.id", index=True)


class QuantitySample(QuantitySampleBase, RecordIdentity, table=True):
    __tablename__ = "quantity_sample"


class QuantitySampleCreate(QuantitySampleBase):
    pass


class QuantitySampleRead(QuantitySampleBase, RecordIdentity):
    pass


class CategorySampleBase(SampleSource):
    patient_id: int | None = Field(default=None, foreign_key="patient.id", index=True)
    category_type: str = Field(
        index=True,
        description="HealthKit category identifier, e.g. 'HKCategoryTypeIdentifierSleepAnalysis'.",
    )
    value: int = Field(description="Enumerated category value as defined by HealthKit.")
    start_date: datetime = Field(index=True)
    end_date: datetime = Field(index=True)
    correlation_id: int | None = Field(default=None, foreign_key="correlation.id", index=True)
    workout_id: int | None = Field(default=None, foreign_key="workout.id", index=True)


class CategorySample(CategorySampleBase, RecordIdentity, table=True):
    __tablename__ = "category_sample"


class CategorySampleCreate(CategorySampleBase):
    pass


class CategorySampleRead(CategorySampleBase, RecordIdentity):
    pass


class CorrelationBase(SampleSource):
    patient_id: int | None = Field(default=None, foreign_key="patient.id", index=True)
    correlation_type: str = Field(
        index=True,
        description="HealthKit correlation identifier, e.g. 'HKCorrelationTypeIdentifierBloodPressure'.",
    )
    start_date: datetime = Field(index=True)
    end_date: datetime = Field(index=True)


class Correlation(CorrelationBase, RecordIdentity, table=True):
    __tablename__ = "correlation"


class CorrelationCreate(CorrelationBase):
    pass


class CorrelationRead(CorrelationBase, RecordIdentity):
    pass
