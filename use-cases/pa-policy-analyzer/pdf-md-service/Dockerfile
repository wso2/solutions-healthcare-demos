# syntax=docker/dockerfile:1.7

FROM python:3.13-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

RUN pip install --no-cache-dir uv==0.5.11

WORKDIR /app

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-dev --no-install-project

COPY main.py ./

FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# Choreo requires a numeric UID between 10000-20000
ARG APP_UID=10014
ARG APP_GID=10014
RUN groupadd --system --gid ${APP_GID} appgroup \
 && useradd --system --uid ${APP_UID} --gid ${APP_GID} --home /app --shell /usr/sbin/nologin appuser

WORKDIR /app

COPY --from=builder --chown=${APP_UID}:${APP_GID} /app /app

USER 10014

EXPOSE 6093

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "6093"]
