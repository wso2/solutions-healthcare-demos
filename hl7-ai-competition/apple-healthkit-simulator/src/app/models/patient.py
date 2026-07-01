from datetime import date

from sqlmodel import Field, SQLModel

from app.models.base import RecordIdentity


class PatientBase(SQLModel):
    mrn: str = Field(index=True, unique=True, description="Medical record number shared with the FHIR server.")
    given_name: str = Field(description="Patient given (first) name.")
    family_name: str = Field(description="Patient family (last) name.")
    date_of_birth: date | None = Field(default=None, description="Patient date of birth.")
    fhir_patient_id: str | None = Field(default=None, index=True, description="Matching FHIR server Patient.id.")


class Patient(PatientBase, RecordIdentity, table=True):
    __tablename__ = "patient"


class PatientCreate(PatientBase):
    pass


class PatientRead(PatientBase, RecordIdentity):
    pass
