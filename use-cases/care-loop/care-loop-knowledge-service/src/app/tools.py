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

"""MCP tool implementations.

Thin wrappers over the retriever and the static feature glossary, kept separate from the FastMCP
server wiring so they can be unit-tested with a stub retriever and no network.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.feature_defs import get_feature_definition as lookup_feature_definition
from app.schemas import EducationHit, FeatureDefinition, GuidelineHit

if TYPE_CHECKING:
    from app.retrieval import Retriever


def search_guidelines(
    retriever: Retriever,
    query: str,
    k: int = 4,
    source_filter: str | None = None,
) -> list[GuidelineHit]:
    """Return the top clinician-facing guideline passages for ``query``."""
    where: dict = {"audience": "clinician"}
    if source_filter:
        where = {"$and": [{"audience": "clinician"}, {"source": source_filter}]}
    return [
        GuidelineHit(
            text=hit["text"],
            source=hit["source"],
            section=hit["section"],
            citation=hit["citation"],
            score=hit["score"],
        )
        for hit in retriever.search(query, k=k, where=where)
    ]


def search_patient_education(retriever: Retriever, query: str, k: int = 4) -> list[EducationHit]:
    """Return the top patient-facing education passages for ``query``."""
    return [
        EducationHit(
            text=hit["text"],
            source=hit["source"],
            citation=hit["citation"],
            reading_level=hit["reading_level"],
        )
        for hit in retriever.search(query, k=k, where={"audience": "patient"})
    ]


def feature_definition(feature_name: str) -> FeatureDefinition | None:
    """Return the static definition of one Kaggle heart-failure feature, or None."""
    return lookup_feature_definition(feature_name)
