"""Request interceptor for WSO2 Agent Manager's `claude-judge` LLM provider (gateway policy
`interceptor-service`).

AMP's LLM-judge evaluators send OpenAI Chat Completions requests with a `response_format` JSON schema whose
score field has `minimum`/`maximum`. Anthropic's OpenAI-compatible API rejects that schema (400), and the
judge cannot be told not to send it. This interceptor removes `response_format` from the request; the
judge's prompt already asks for the same JSON object, and the judge validates the reply itself.

Contract (gateway → interceptor): POST /handle-request with {"requestBody": base64, ...}; the reply
{"body": base64} replaces the request body. /handle-response is a no-op.
"""

import base64
import json
import logging
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("judge-adapter")


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        reply = {}
        if self.path.endswith("/handle-request") and payload.get("requestBody"):
            try:
                body = json.loads(base64.b64decode(payload["requestBody"]))
                if isinstance(body, dict) and body.pop("response_format", None) is not None:
                    reply["body"] = base64.b64encode(json.dumps(body).encode()).decode()
                    log.info("removed response_format from a judge request (model %s)", body.get("model"))
            except (ValueError, TypeError) as e:
                log.warning("left a request unchanged: %s", e)
        data = json.dumps(reply).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    log.info("listening on :8090")
    ThreadingHTTPServer(("0.0.0.0", 8090), Handler).serve_forever()
