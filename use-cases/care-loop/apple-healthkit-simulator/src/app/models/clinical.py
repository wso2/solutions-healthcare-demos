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
