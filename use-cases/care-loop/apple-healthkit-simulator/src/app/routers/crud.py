from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, SQLModel, select

from app.db import get_session

SessionDep = Annotated[Session, Depends(get_session)]

DEFAULT_LIMIT = 100
MAX_LIMIT = 1000


def build_router(
    *,
    prefix: str,
    tag: str,
    table_model: type[SQLModel],
    create_model: type[SQLModel],
    read_model: type[SQLModel],
) -> APIRouter:
    """Build a CRUD router for one HealthKit object type.

    Every HealthKit object follows the same ingest contract: ingest a batch
    of records, list recent records, and fetch a single record by its UUID.
    This factory wires those three operations for a given model triple so each
    object type does not repeat the boilerplate.

    Args:
        prefix: URL prefix for the resource, e.g. ``/quantity-samples``.
        tag: OpenAPI tag used to group the routes.
        table_model: SQLModel table class persisted to the database.
        create_model: Schema accepted on ingest (no server-assigned fields).
        read_model: Schema returned to clients (includes id, uuid, timestamp).

    Returns:
        A configured ``APIRouter`` for the resource.
    """
    router = APIRouter(prefix=prefix, tags=[tag])

    @router.post("", response_model=list[read_model], status_code=status.HTTP_201_CREATED)
    def ingest(items: list[create_model], session: SessionDep) -> list[SQLModel]:
        records = [table_model.model_validate(item.model_dump()) for item in items]
        session.add_all(records)
        session.commit()
        for record in records:
            session.refresh(record)
        return records

    @router.get("", response_model=list[read_model])
    def list_records(
        session: SessionDep,
        patient_id: Annotated[int | None, Query()] = None,
        since: Annotated[datetime | None, Query()] = None,
        until: Annotated[datetime | None, Query()] = None,
        limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> list[SQLModel]:
        statement = select(table_model).order_by(table_model.id.desc()).offset(offset).limit(limit)
        if patient_id is not None and hasattr(table_model, "patient_id"):
            statement = statement.where(table_model.patient_id == patient_id)
        if since is not None and hasattr(table_model, "start_date"):
            statement = statement.where(table_model.start_date >= since)
        if until is not None and hasattr(table_model, "start_date"):
            statement = statement.where(table_model.start_date < until)
        return list(session.exec(statement).all())

    @router.get("/{uuid}", response_model=read_model)
    def get_record(uuid: str, session: SessionDep) -> SQLModel:
        statement = select(table_model).where(table_model.uuid == uuid)
        record = session.exec(statement).first()
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{tag} '{uuid}' not found")
        return record

    return router
