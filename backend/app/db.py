from typing import Generator

from sqlmodel import Session, SQLModel, create_engine

from .config import get_settings

settings = get_settings()
engine = create_engine(
    settings.db_url,
    connect_args={"check_same_thread": False} if settings.db_url.startswith("sqlite") else {},
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
