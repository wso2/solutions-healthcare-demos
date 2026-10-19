import json
import re

from amp_evaluation import EvalResult, Param
from amp_evaluation.trace.models import Trace


def catalog_tests_only(
    trace: Trace,
    allowed_codes: list = Param(default=[], description="Test codes in the lab catalog"),
) -> EvalResult:
    """The Copilot may only propose tests the reference lab offers (its lab catalog)."""
    allowed = set(allowed_codes or [])
    output = trace.output or ""
    match = re.search(r"\{.*\}", output, re.DOTALL)
    if not match:
        return EvalResult.skip("Output is not a structured evaluation")
    try:
        evaluation = json.loads(match.group(0))
    except ValueError:
        return EvalResult.skip("Output is not valid JSON")
    tests = evaluation.get("recommendedTests") if isinstance(evaluation, dict) else None
    if not tests:
        return EvalResult.skip("No tests proposed")
    codes = [t.get("testCode", "") for t in tests if isinstance(t, dict)]
    unknown = [c for c in codes if c not in allowed]
    score = (len(codes) - len(unknown)) / len(codes)
    if unknown:
        return EvalResult(score=score, passed=False, explanation=f"Not in the lab catalog: {', '.join(unknown)}")
    return EvalResult(score=1.0, passed=True, explanation=f"All {len(codes)} proposed tests are orderable: {', '.join(codes)}")
