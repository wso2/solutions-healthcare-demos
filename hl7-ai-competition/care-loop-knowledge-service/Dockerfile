# Multi-stage build adapted from astral-sh/uv-docker-example, base bumped to python3.13.

FROM ghcr.io/astral-sh/uv:python3.13-trixie-slim AS builder
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Omit development dependencies. The serving image includes the local embedding extra so the stack can run without an OpenAI embeddings key.
ENV UV_NO_DEV=1

# Use the system interpreter across both images; disable managed Python downloads.
ENV UV_PYTHON_DOWNLOADS=0

WORKDIR /app
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --extra embed-local --no-install-project
COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --extra embed-local


# Final image without uv; must match the builder so the Python path is identical.
FROM python:3.13-slim-trixie

# Set up a non-root user.
RUN groupadd --system --gid 999 nonroot \
 && useradd --system --gid 999 --uid 999 --create-home nonroot

# Copy the application (including the committed Chroma store if present) from the builder.
COPY --from=builder --chown=nonroot:nonroot /app /app

# Put the venv executables at the front of the path.
ENV PATH="/app/.venv/bin:$PATH"

# Unbuffered stdout/stderr so logs are not lost if the app crashes.
ENV PYTHONUNBUFFERED=1

USER nonroot
WORKDIR /app
EXPOSE 8000

# The MCP server runs its own ASGI stack (streamable-http), so we launch the module directly.
CMD ["python", "-m", "app.server"]
