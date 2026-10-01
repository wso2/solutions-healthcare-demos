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

from sqlmodel import Field

from app.models.base import (
    BiologicalSex,
    BloodType,
    FitzpatrickSkinType,
    RecordIdentity,
    SampleSource,
)


class ActivitySummaryBase(SampleSource):
    patient_id: int | None = Field(default=None, foreign_key="patient.id", index=True)
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
    patient_id: int | None = Field(default=None, foreign_key="patient.id", index=True)
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
