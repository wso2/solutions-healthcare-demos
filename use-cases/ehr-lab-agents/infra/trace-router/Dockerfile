FROM python:3.12.7-slim
RUN pip install --no-cache-dir opentelemetry-proto==1.27.0
COPY router.py /app/router.py
# The usage ledger (a named volume) — owned by the user the router runs as.
RUN mkdir /data && chown nobody /data
USER nobody
EXPOSE 4318
CMD ["python", "-u", "/app/router.py"]
