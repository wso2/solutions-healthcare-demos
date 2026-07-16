from app import tools
from app.retrieval import Retriever
from app.schemas import EducationHit, GuidelineHit


def test_search_guidelines_returns_guideline_hits(retriever: Retriever) -> None:
    hits = tools.search_guidelines(retriever, "ejection fraction therapy", k=5)
    assert hits
    assert all(isinstance(hit, GuidelineHit) for hit in hits)


def test_search_patient_education_returns_education_hits(retriever: Retriever) -> None:
    hits = tools.search_patient_education(retriever, "trouble breathing", k=5)
    assert hits
    assert all(isinstance(hit, EducationHit) for hit in hits)
    assert all(hit.reading_level in ("plain", "basic") for hit in hits)


def test_feature_definition_exact_match() -> None:
    age = tools.feature_definition("Age")
    assert age is not None
    assert age.model_usage == "used by the deployed model"


def test_feature_definition_alias() -> None:
    chest = tools.feature_definition("chest_pain_type")
    assert chest is not None
    assert chest.feature == "ChestPainType"

    st_slope = tools.feature_definition("st slope")
    assert st_slope is not None
    assert st_slope.feature == "ST_Slope"
    assert "optional" in st_slope.model_usage


def test_feature_definition_unknown_returns_none() -> None:
    assert tools.feature_definition("blood type") is None
