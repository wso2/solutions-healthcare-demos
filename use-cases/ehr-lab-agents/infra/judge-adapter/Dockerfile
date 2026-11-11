FROM python:3.12.7-slim
COPY adapter.py /app/adapter.py
USER nobody
EXPOSE 8090
CMD ["python", "-u", "/app/adapter.py"]
