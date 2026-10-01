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
