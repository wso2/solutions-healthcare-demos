from sqlalchemy import JSON
from sqlmodel import Field

from app.models.base import RecordIdentity, SampleSource


class ClinicalRecordBase(SampleSource):
    patient_id: int | None = Field(default=None, foreign_key="patient.id", index=True)
    fhir_resource_type: str = Field(
        index=True,
        description="FHIR resource type, e.g. 'Observation', 'Condition', 'MedicationRequest'.",
    )
    fhir_release: str | None = Field(default=None, description="FHIR release/version, e.g. 'R4'.")
    display_name: str | None = Field(default=None, description="Human-readable record name.")
    resource: dict = Field(
        default_factory=dict,
        sa_type=JSON,
        description="Raw FHIR resource payload.",
    )


class ClinicalRecord(ClinicalRecordBase, RecordIdentity, table=True):
    __tablename__ = "clinical_record"


class ClinicalRecordCreate(ClinicalRecordBase):
    pass


class ClinicalRecordRead(ClinicalRecordBase, RecordIdentity):
    pass
