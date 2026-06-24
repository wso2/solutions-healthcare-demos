import sqlite3
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import Engine, event
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

_SQLITE_FILE_PREFIX = "sqlite:///"


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection: object, _connection_record: object) -> None:
    """Turn on foreign-key enforcement for every SQLite connection.

    SQLite leaves `PRAGMA foreign_keys` OFF by default, so without this the
    `correlation_id`/`workout_id` foreign keys would silently accept rows that
    reference a non-existent parent.
    """
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def _build_engine() -> Engine:
    settings = get_settings()
    url = settings.database_url
    connect_args: dict[str, object] = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        if url.startswith(_SQLITE_FILE_PREFIX) and ":memory:" not in url:
            db_path = Path(url.removeprefix(_SQLITE_FILE_PREFIX))
            db_path.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(url, echo=settings.echo_sql, connect_args=connect_args)


engine = _build_engine()


def init_db() -> None:
    """Create all tables. Safe to call repeatedly; existing tables are kept."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session]:
    with Session(engine) as session:
        yield session
