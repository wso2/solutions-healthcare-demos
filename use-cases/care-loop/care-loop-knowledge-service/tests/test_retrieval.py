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

import tiktoken

from app.retrieval import MAX_CHUNK_TOKENS, Retriever, _truncate_tokens


def test_search_filters_by_audience(retriever: Retriever) -> None:
    hits = retriever.search("shortness of breath", k=5, where={"audience": "patient"})
    assert hits
    assert all(hit["audience"] == "patient" for hit in hits)


def test_search_clinician_audience(retriever: Retriever) -> None:
    hits = retriever.search("guideline directed therapy", k=5, where={"audience": "clinician"})
    assert hits
    assert all(hit["audience"] == "clinician" for hit in hits)


def test_search_hit_shape_and_citation(retriever: Retriever) -> None:
    hits = retriever.search("weight gain", k=5, where={"audience": "clinician"})
    assert hits
    hit = hits[0]
    for key in ("text", "source", "section", "citation", "score"):
        assert key in hit
    assert hit["citation"].startswith("Fixture:")
    assert 0.0 <= hit["score"] <= 1.0


def test_truncate_caps_token_length() -> None:
    long_text = "congestion " * 4000
    truncated = _truncate_tokens(long_text)
    encoding = tiktoken.get_encoding("cl100k_base")
    assert len(encoding.encode(truncated)) <= MAX_CHUNK_TOKENS
