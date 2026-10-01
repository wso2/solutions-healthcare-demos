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
