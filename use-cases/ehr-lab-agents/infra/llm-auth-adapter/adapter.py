"""Between the integration and WSO2 Agent Manager's AI gateway, for the agents on OpenRouter.

Ballerina's OpenRouter client (OpenAI-style) differs from what the gateway and some providers accept in two
ways, and neither can be configured on the client:

- It sends its key as "Authorization: Bearer <key>". The gateway checks each agent's key in x-api-key (as for
  the Anthropic client), and Agent Manager drops the gateway option that would strip "Bearer "
  (ISSUES_TO_REPORT.md D14). The key is moved across.
- It sends optional fields as JSON null (e.g. a tool's "strict": null). Most providers ignore them; Mistral's
  API rejects the request (422 "Extra inputs are not permitted"). Null fields are dropped from JSON bodies.

Everything else is forwarded unchanged. It holds no secret: the agent's own key passes through.
"""

import http.client
import json
import logging
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

GATEWAY_HOST = os.environ.get("GATEWAY_HOST", "default-default.gateway.localhost")
GATEWAY_PORT = int(os.environ.get("GATEWAY_PORT", "19080"))
TIMEOUT = float(os.environ.get("TIMEOUT_SECONDS", "300"))
HOP_BY_HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers",
              "transfer-encoding", "upgrade", "host", "content-length", "authorization"}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("llm-auth-adapter")


def without_nulls(value):
    if isinstance(value, dict):
        return {k: without_nulls(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [without_nulls(v) for v in value]
    return value


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _read_body(self):
        # The Ballerina client sends request bodies chunked (no Content-Length).
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            chunks = []
            while True:
                size = int(self.rfile.readline().split(b";")[0].strip() or b"0", 16)
                if size == 0:
                    while self.rfile.readline() not in (b"\r\n", b"\n", b""):
                        pass  # trailers
                    break
                chunks.append(self.rfile.read(size))
                self.rfile.readline()  # CRLF after each chunk
            return b"".join(chunks)
        return self.rfile.read(int(self.headers.get("Content-Length", 0) or 0))

    def _forward(self):
        body = self._read_body()
        if body and "json" in (self.headers.get("Content-Type") or ""):
            try:
                body = json.dumps(without_nulls(json.loads(body))).encode()
            except ValueError:
                pass  # not JSON after all: forward as is
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_BY_HOP}
        auth = self.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            headers["x-api-key"] = auth[7:].strip()
        headers["Host"] = f"{GATEWAY_HOST}:{GATEWAY_PORT}"
        headers["Content-Length"] = str(len(body))
        conn = http.client.HTTPConnection(GATEWAY_HOST, GATEWAY_PORT, timeout=TIMEOUT)
        try:
            conn.request(self.command, self.path, body=body if body else None, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
            self.send_response(resp.status)
            for k, v in resp.getheaders():
                if k.lower() not in HOP_BY_HOP:
                    self.send_header(k, v)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            log.info("%s %s -> %d (%d bytes in, %d out)", self.command, self.path, resp.status, len(body), len(data))
        except OSError as err:
            log.error("%s %s failed: %s", self.command, self.path, err)
            message = json.dumps({"error": {"message": f"llm-auth-adapter: gateway unreachable ({err})"}}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)
        finally:
            conn.close()

    do_GET = do_POST = do_PUT = do_DELETE = _forward

    def log_message(self, *args):
        pass  # requests are logged in _forward, without headers


if __name__ == "__main__":
    log.info("forwarding to %s:%d", GATEWAY_HOST, GATEWAY_PORT)
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
