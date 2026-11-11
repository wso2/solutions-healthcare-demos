import re

from amp_evaluation import EvalResult, Param
from amp_evaluation.trace.models import AgentTrace

PMID = re.compile(r"PMID[:\s]*(\d{4,9})", re.IGNORECASE)


def pubmed_citation_integrity(
    agent_trace: AgentTrace,
    literature_tools: list = Param(default=["search_pubmed", "get_abstract"],
                                   description="Tools whose results count as retrieved literature"),
) -> EvalResult:
    """Every PMID the agent cites must come from a PubMed tool result in the same run (no invented citations)."""
    output = agent_trace.output or ""
    cited = set(PMID.findall(output))
    if not cited:
        return EvalResult.skip("No PubMed citations in the output")
    tools = set(literature_tools or ["search_pubmed", "get_abstract"])
    retrieved = set()
    for step in agent_trace.get_tool_steps():
        if step.tool_name in tools:
            text = f"{step.tool_output or ''} {step.content or ''}"
            retrieved.update(re.findall(r"\b\d{4,9}\b", text))
    unsupported = sorted(cited - retrieved)
    score = (len(cited) - len(unsupported)) / len(cited)
    if unsupported:
        return EvalResult(score=score, passed=False,
                          explanation=f"Cited but never retrieved: {', '.join(unsupported)} ({len(cited)} cited)")
    return EvalResult(score=1.0, passed=True, explanation=f"All {len(cited)} cited PMIDs were retrieved from PubMed")
