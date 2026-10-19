"""Routes the integration's traces to WSO2 Agent Manager, one agent per trace.

Agent Manager attributes a trace to an agent by the API key it arrives with (`x-amp-api-key`), but the
integration is one Ballerina process hosting three agents, and a process has one trace exporter.
This router sits between them: it receives the integration's OTLP/HTTP export, holds each trace's
spans until an agent run in it has finished (its `invoke_agent` span, which ends after all of its LLM
and tool spans) or the trace's root has ended, finds the agent (`gen_ai.agent.name`, which ballerina/ai
sets to the agent's role) and forwards the spans with that agent's key.

An agent often runs after the request that started it has answered (the Copilot evaluation returns 202
and runs in the background), so its spans can arrive after the root span: they are held as a new group
of the same trace and sent when the run's `invoke_agent` span arrives.

Spans that are not part of an agent run (the lab poller, portal reads, FHIR writes, and the
`create_agent` span each agent emits when the integration starts) are counted and dropped rather than
charged to an agent.

Agent spans are also normalised for Agent Manager's trace model: ballerina/ai records an agent's input and
output in `gen_ai.input.messages` / `gen_ai.output.messages` as a plain string or a JSON object. Agent
Manager's evaluators read an agent's input and output as text from `traceloop.entity.input`/`output` (a
message list there becomes an empty agent output), so the router moves them there. Without this, evaluators
see an empty input and output and skip the trace.

Routes are read from ROUTES_FILE (written by scripts/amp-setup.sh) on every flush, so registering the
agents again takes effect without a restart. With no routes file, everything is dropped.

Usage ledger: every agent run is also recorded in LEDGER_FILE — tokens from its `chat` spans, priced with the
AI gateway's own price list (PRICES_FILE, exported by scripts/amp-budgets.sh), and the assessment it served
(from the run's `gen_ai.conversation.id`, "<assessment>:<step>"). GET /usage returns spend per agent against
the budgets Agent Manager enforces (BUDGETS_FILE) and the latest runs; GET /usage?assessment=<id> returns one
assessment's runs. Agent Manager's console shows tokens per trace but not cost, hence this view.
"""

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTraceServiceRequest
from opentelemetry.proto.common.v1.common_pb2 import KeyValue

ROUTES_FILE = os.environ.get("ROUTES_FILE", "/config/trace-routes.json")
PRICES_FILE = os.environ.get("PRICES_FILE", "/config/model-prices.json")
BUDGETS_FILE = os.environ.get("BUDGETS_FILE", "/config/budgets.json")
LEDGER_FILE = os.environ.get("LEDGER_FILE", "/data/usage.jsonl")
PORT = int(os.environ.get("PORT", "4318"))
# How long to wait after a trace's root span arrives for stragglers from other export batches.
ROOT_GRACE_SECONDS = float(os.environ.get("ROOT_GRACE_SECONDS", "3"))
# A trace whose root never arrives (the process died mid-run) is flushed after this long.
MAX_TRACE_AGE_SECONDS = float(os.environ.get("MAX_TRACE_AGE_SECONDS", "900"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("trace-router")

lock = threading.Lock()
# trace id -> {"spans": [(resource, scope, span)], "agent": str|None, "root_at": float|None, "first": float}
# "root_at" is when the trace's root or an agent run's `invoke_agent` span arrived (the flush trigger).
traces = {}
stats = {"forwarded": defaultdict(int), "dropped": 0, "failed": 0}
ledger = []  # agent runs, oldest first (also appended to LEDGER_FILE)


def load_routes():
    """Returns {"endpoint": url, "agents": {agent name: {"apiKey": key, "agent": amp agent name}}}."""
    try:
        with open(ROUTES_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return {"endpoint": None, "agents": {}}
    except (OSError, json.JSONDecodeError) as e:
        log.warning("cannot read %s: %s", ROUTES_FILE, e)
        return {"endpoint": None, "agents": {}}


def is_agent_run(span):
    return any(a.key == "gen_ai.operation.name" and a.value.string_value == "invoke_agent" for a in span.attributes)


def agent_of(span):
    for attr in span.attributes:
        if attr.key == "gen_ai.agent.name" and attr.value.string_value:
            return attr.value.string_value
    return None


def read_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def attribute_number(span, key):
    for attr in span.attributes:
        if attr.key == key:
            value = attr.value
            if value.HasField("int_value"):
                return value.int_value
            if value.HasField("double_value"):
                return int(value.double_value)
            try:
                return int(value.string_value)
            except ValueError:
                return 0
    return 0


def price_of(model, prices):
    """The gateway's price entry for a model (exact name, or the name without a date suffix)."""
    if model in prices:
        return prices[model]
    for name, entry in prices.items():
        if model.startswith(name) or name.startswith(model):
            return entry
    return None


def record_usage(trace, routes):
    """Adds one ledger entry per agent run (`invoke_agent` span) in a finished trace."""
    spans = trace["spans"]
    children = defaultdict(list)
    for _, _, span in spans:
        children[span.parent_span_id].append(span)
    prices = read_json(PRICES_FILE, {})
    names = {role: route.get("agent", role) for role, route in routes.get("agents", {}).items()}
    entries = []
    for _, _, run in spans:
        if not is_agent_run(run):
            continue
        input_tokens = output_tokens = llm_calls = tool_calls = 0
        model = None
        stack, seen = list(children[run.span_id]), set()
        while stack:
            span = stack.pop()
            if span.span_id in seen:
                continue
            seen.add(span.span_id)
            stack.extend(children[span.span_id])
            operation = attribute(span, "gen_ai.operation.name")
            if operation == "chat":
                llm_calls += 1
                input_tokens += attribute_number(span, "gen_ai.usage.input_tokens")
                output_tokens += attribute_number(span, "gen_ai.usage.output_tokens")
                model = model or attribute(span, "gen_ai.response.model") or attribute(span, "gen_ai.request.model")
            elif operation == "execute_tool":
                tool_calls += 1
        price = price_of(model or "", prices)
        cost = None
        if price:
            cost = input_tokens * price.get("input_cost_per_token", 0) + output_tokens * price.get("output_cost_per_token", 0)
        role = agent_of(run) or trace["agent"] or ""
        conversation = attribute(run, "gen_ai.conversation.id") or ""
        assessment, _, step = conversation.partition(":")
        entries.append({
            "traceId": run.trace_id.hex(),
            "agent": names.get(role, role),
            "role": role,
            "assessmentId": assessment or None,
            "step": step or None,
            "model": model,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "llmCalls": llm_calls,
            "toolCalls": tool_calls,
            "costUsd": round(cost, 6) if cost is not None else None,
            "startedAt": run.start_time_unix_nano / 1e9,
            "durationMs": int((run.end_time_unix_nano - run.start_time_unix_nano) / 1e6),
            "ok": run.status.code != 2,
        })
    if not entries:
        return
    with lock:
        ledger.extend(entries)
    try:
        with open(LEDGER_FILE, "a") as f:
            for entry in entries:
                f.write(json.dumps(entry) + "\n")
    except OSError as e:
        log.warning("cannot write the usage ledger %s: %s", LEDGER_FILE, e)


def load_ledger():
    try:
        with open(LEDGER_FILE) as f:
            for line in f:
                try:
                    ledger.append(json.loads(line))
                except ValueError:
                    pass
    except OSError:
        pass
    log.info("usage ledger: %d agent runs from %s", len(ledger), LEDGER_FILE)


def usage(assessment=None):
    now = time.time()
    with lock:
        runs = list(ledger)
    budgets = read_json(BUDGETS_FILE, {})
    if assessment:
        selected = [r for r in runs if r.get("assessmentId") == assessment]
        return {"currency": "USD", "assessmentId": assessment, "runs": selected, "totals": totals(selected)}
    agents = {}
    for name in sorted({r["agent"] for r in runs} | set(budgets)):
        mine = [r for r in runs if r["agent"] == name]
        day = [r for r in mine if now - r["startedAt"] <= 86400]
        hour = [r for r in mine if now - r["startedAt"] <= 3600]
        agents[name] = {
            "role": next((r["role"] for r in mine), None),
            "allTime": totals(mine),
            "last24h": totals(day),
            "lastHour": totals(hour),
            "budget": budgets.get(name),
        }
    return {
        "currency": "USD",
        "pricedWith": "the AI gateway's price list",
        "prices": read_json(PRICES_FILE, {}),
        "agents": agents,
        "runs": runs[-50:][::-1],
        "totals": totals(runs),
    }


def totals(runs):
    return {
        "runs": len(runs),
        "inputTokens": sum(r["inputTokens"] for r in runs),
        "outputTokens": sum(r["outputTokens"] for r in runs),
        "costUsd": round(sum(r["costUsd"] or 0 for r in runs), 6),
    }


def accept(payload):
    request = ExportTraceServiceRequest()
    request.ParseFromString(payload)
    now = time.time()
    with lock:
        for resource_spans in request.resource_spans:
            for scope_spans in resource_spans.scope_spans:
                for span in scope_spans.spans:
                    trace = traces.setdefault(span.trace_id, {"spans": [], "agent": None, "run": False, "root_at": None, "first": now})
                    trace["run"] = trace["run"] or is_agent_run(span)
                    trace["spans"].append((resource_spans.resource, scope_spans.scope, span))
                    trace["agent"] = trace["agent"] or agent_of(span)
                    if not span.parent_span_id or is_agent_run(span):
                        trace["root_at"] = now


def attribute(span, key):
    for attr in span.attributes:
        if attr.key == key:
            return attr.value.string_value
    return None


def remove_attribute(span, key):
    for attr in list(span.attributes):
        if attr.key == key:
            span.attributes.remove(attr)


def set_attribute(span, key, value):
    remove_attribute(span, key)
    span.attributes.append(KeyValue(key=key))
    span.attributes[-1].value.string_value = value


def as_text(raw):
    """An agent input/output as text: a JSON object (a typed agent result) is kept as compact JSON."""
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
    except ValueError:
        return raw
    if isinstance(parsed, list):
        return None  # already a message list
    return parsed if isinstance(parsed, str) else raw


def normalise_agent_span(span):
    """Gives an `invoke_agent` span the input/output shapes Agent Manager reads."""
    if not is_agent_run(span):
        return
    for direction in ("input", "output"):
        text = as_text(attribute(span, f"gen_ai.{direction}.messages"))
        if text is None:
            continue
        set_attribute(span, f"traceloop.entity.{direction}", text)
        # Left in place, Agent Manager would try to read this as a message list and drop the text above.
        remove_attribute(span, f"gen_ai.{direction}.messages")


def agent_subtree(spans):
    """Keeps only agent runs: each `invoke_agent` span and its descendants. Other spans of the trace (the
    request that started a background run, database writes after it) are not the agent's, and as extra
    roots they would hide the run's input and output from Agent Manager."""
    children = defaultdict(list)
    for item in spans:
        children[item[2].parent_span_id].append(item)
    kept, stack = [], [item for item in spans if is_agent_run(item[2])]
    seen = set()
    while stack:
        item = stack.pop()
        if item[2].span_id in seen:
            continue
        seen.add(item[2].span_id)
        kept.append(item)
        stack.extend(children[item[2].span_id])
    return kept


def build_request(spans):
    """Regroups a trace's spans by resource and scope into one export request. A span whose parent is
    not being sent (the request span that started a background agent run, sent earlier and dropped)
    becomes a root, so Agent Manager lists the run as a trace of its own."""
    sent = {span.span_id for _, _, span in spans}
    for _, _, span in spans:
        if span.parent_span_id and span.parent_span_id not in sent:
            span.parent_span_id = b""
        normalise_agent_span(span)
    request = ExportTraceServiceRequest()
    groups = {}
    for resource, scope, span in spans:
        key = (resource.SerializeToString(), scope.SerializeToString())
        if key not in groups:
            resource_spans = request.resource_spans.add()
            resource_spans.resource.CopyFrom(resource)
            scope_spans = resource_spans.scope_spans.add()
            scope_spans.scope.CopyFrom(scope)
            groups[key] = scope_spans
        groups[key].spans.append(span)
    return request.SerializeToString()


def forward(endpoint, api_key, body):
    req = urllib.request.Request(endpoint, data=body, method="POST", headers={
        "Content-Type": "application/x-protobuf",
        "x-amp-api-key": api_key,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.status


def flush_loop():
    while True:
        time.sleep(1)
        now = time.time()
        ready = []
        with lock:
            for trace_id, trace in list(traces.items()):
                root_done = trace["root_at"] is not None and now - trace["root_at"] >= ROOT_GRACE_SECONDS
                if root_done or now - trace["first"] >= MAX_TRACE_AGE_SECONDS:
                    ready.append(traces.pop(trace_id))
        if not ready:
            continue
        routes = load_routes()
        for trace in ready:
            if trace["run"]:
                try:
                    record_usage(trace, routes)
                except Exception as e:  # the ledger must never stop traces reaching Agent Manager
                    log.warning("recording usage failed: %s", e)
            route = routes.get("agents", {}).get(trace["agent"] or "")
            if not trace["run"] or not route or not routes.get("endpoint"):
                stats["dropped"] += 1
                continue
            try:
                spans = agent_subtree(trace["spans"])
                status = forward(routes["endpoint"], route["apiKey"], build_request(spans))
                stats["forwarded"][route.get("agent", trace["agent"])] += 1
                log.info("trace of %s → %s (%d spans, HTTP %s)", trace["agent"], route.get("agent"), len(spans), status)
            except (urllib.error.URLError, OSError) as e:
                stats["failed"] += 1
                log.warning("forwarding a trace of %s failed: %s", trace["agent"], e)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # The OTLP exporter posts to <endpoint>/v1/traces; any path is accepted so the endpoint's
        # path prefix does not matter.
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            accept(body)
        except Exception as e:  # a malformed batch must not take the router down
            log.warning("rejected an export from %s: %s", self.client_address[0], e)
            self.send_response(400)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/x-protobuf")
        self.end_headers()
        self.wfile.write(b"")

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path.rstrip("/") == "/usage":
            params = urllib.parse.parse_qs(query)
            body = json.dumps(usage((params.get("assessment") or [None])[0])).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
            return
        with lock:
            pending = len(traces)
        body = json.dumps({
            "forwarded": dict(stats["forwarded"]),
            "dropped": stats["dropped"],
            "failed": stats["failed"],
            "pending": pending,
            "routes": sorted(load_routes().get("agents", {}).keys()),
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    load_ledger()
    threading.Thread(target=flush_loop, daemon=True).start()
    log.info("listening on :%d, routes from %s", PORT, ROUTES_FILE)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
