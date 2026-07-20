"""FastMCP server exposing the HFrEF knowledge base as MCP tools over streamable-HTTP.

The transport config (json_response + stateless_http on /mcp) matches the wso2/fhir-mcp-server the
stack already consumes, so the Ballerina ai:McpToolKit connects to this server the same way.
"""

from __future__ import annotations

from functools import lru_cache

from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse

from app import tools
from app.config import get_settings
from app.retrieval import Retriever, build_retriever
from app.schemas import EducationHit, FeatureDefinition, GuidelineHit

settings = get_settings()

mcp = FastMCP(
    name="Care Loop Knowledge MCP Server",
    instructions="HFrEF clinical-guideline and patient-education retrieval for Care Loop agents.",
    host=settings.host,
    port=settings.port,
    json_response=True,
    stateless_http=True,
)


@lru_cache
def _retriever() -> Retriever:
    """Build the retriever once, lazily, on first tool call."""
    return build_retriever(settings)


@mcp.tool()
def search_guidelines(query: str, k: int = 4, source_filter: str | None = None) -> list[GuidelineHit]:
    """Search HFrEF clinical guidance for thresholds and recommendations.

    Use this before judging whether a vital or lab value is normal, borderline, or abnormal, or when
    you need a guideline-backed rule (EF cutoffs, GDMT, diuretic / weight-gain thresholds, heart-rate
    and blood-pressure targets). Cite the returned ``citation`` string in your reasoning.

    Args:
        query: What to look up, e.g. "diuretic weight gain threshold".
        k: Number of passages to return.
        source_filter: Optional source id to restrict to (e.g. "statpearls-heart-failure").
    """
    return tools.search_guidelines(_retriever(), query, k=k, source_filter=source_filter)


@mcp.tool()
def search_patient_education(query: str, k: int = 4) -> list[EducationHit]:
    """Find plain-language, 65+-friendly wording for a symptom before phrasing a patient question.

    Use this to word questions a patient will read (e.g. "trouble breathing lying flat", "swelling in
    the ankles", "sudden weight gain") in everyday language rather than clinical terms.

    Args:
        query: The symptom or topic to find patient-friendly wording for.
        k: Number of passages to return.
    """
    return tools.search_patient_education(_retriever(), query, k=k)


@mcp.tool()
def get_feature_definition(feature_name: str) -> FeatureDefinition | None:
    """Return the exact meaning and allowed values of one heart-risk model feature.

    Covers all 11 Kaggle heart-failure features (Age, Sex, MaxHR, ChestPainType, RestingBP,
    Cholesterol, FastingBS, RestingECG, ExerciseAngina, Oldpeak, ST_Slope). Accepts canonical names,
    snake_case, or colloquial aliases. Returns None for an unknown feature.
    """
    return tools.feature_definition(feature_name)


@mcp.custom_route("/health", methods=["GET"])
async def health(_request: Request) -> JSONResponse:
    """Liveness probe for the docker healthcheck."""
    return JSONResponse({"status": "ok"})


def main() -> None:
    """Run the MCP server with the streamable-HTTP transport."""
    mcp.run(transport="streamable-http")


if __name__ == "__main__":
    main()
