from datetime import UTC, datetime
from enum import StrEnum
from uuid import uuid4

from sqlalchemy import JSON
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Return the current time as a timezone-aware UTC datetime."""
    return datetime.now(UTC)


def new_uuid() -> str:
    """Return a fresh string UUID, mirroring HealthKit's per-object UUID."""
    return str(uuid4())


class BiologicalSex(StrEnum):
    """HealthKit `HKBiologicalSex` values."""

    not_set = "notSet"
    female = "female"
    male = "male"
    other = "other"


class BloodType(StrEnum):
    """HealthKit `HKBloodType` values."""

    not_set = "notSet"
    a_positive = "A+"
    a_negative = "A-"
    b_positive = "B+"
    b_negative = "B-"
    ab_positive = "AB+"
    ab_negative = "AB-"
    o_positive = "O+"
    o_negative = "O-"


class FitzpatrickSkinType(StrEnum):
    """HealthKit `HKFitzpatrickSkinType` values."""

    not_set = "notSet"
    type_i = "I"
    type_ii = "II"
    type_iii = "III"
    type_iv = "IV"
    type_v = "V"
    type_vi = "VI"


class SampleSource(SQLModel):
    """Provenance fields shared by every ingested HealthKit object.

    These mirror the `source`, `device`, and `metadata` information that
    HealthKit attaches to each sample so the collector keeps the same context
    the on-device store would expose.
    """

    source_name: str = Field(description="Originating app or device, e.g. 'Apple Watch'.")
    source_version: str | None = Field(default=None, description="Version of the originating source.")
    device_name: str | None = Field(default=None, description="Recording device name.")
    device_manufacturer: str | None = Field(default=None, description="Recording device manufacturer.")
    sample_metadata: dict = Field(
        default_factory=dict,
        sa_type=JSON,
        description="Free-form HealthKit metadata dictionary.",
    )


class RecordIdentity(SQLModel):
    """Identity columns assigned by the collector when a record is stored."""

    id: int | None = Field(default=None, primary_key=True)
    uuid: str = Field(default_factory=new_uuid, index=True, unique=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)
