from typing import Generator
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import NullPool
from sqlalchemy import text

from .config import get_settings

settings = get_settings()

# 判斷資料庫類型
if settings.db_url.startswith("sqlite"):
    # SQLite 不使用連線池，避免多線程寫入衝突
    engine = create_engine(
        settings.db_url,
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )
else:
    # 其他資料庫使用連線池
    engine = create_engine(
        settings.db_url,
        pool_size=10,        # 固定連線數
        max_overflow=20,     # 超過 pool_size 後可額外擴充
    )


def _column_exists(session: Session, table: str, column: str) -> bool:
    if not settings.db_url.startswith("sqlite"):
        return True
    rows = session.exec(text(f"PRAGMA table_info({table});")).all()
    return any(r[1] == column for r in rows)


def _run_light_migrations() -> None:
    if not settings.db_url.startswith("sqlite"):
        return
    with Session(engine) as session:
        if not _column_exists(session, "match", "countdown_secs"):
            session.exec(text("ALTER TABLE match ADD COLUMN countdown_secs INTEGER DEFAULT 300;"))
        if not _column_exists(session, "matchplayer", "ready"):
            session.exec(text("ALTER TABLE matchplayer ADD COLUMN ready BOOLEAN DEFAULT 0;"))
        if not _column_exists(session, "matchplayer", "progress"):
            session.exec(text("ALTER TABLE matchplayer ADD COLUMN progress TEXT;"))
        if not _column_exists(session, "matchplayer", "user_id"):
            session.exec(text("ALTER TABLE matchplayer ADD COLUMN user_id INTEGER;"))
        if not _column_exists(session, "user", "handle"):
            session.exec(text("ALTER TABLE user ADD COLUMN handle VARCHAR(50);"))
        if not _column_exists(session, "leaderboardentry", "handle"):
            session.exec(text("ALTER TABLE leaderboardentry ADD COLUMN handle VARCHAR(50);"))
        if not _column_exists(session, "match", "last_active_at"):
            session.exec(text("ALTER TABLE match ADD COLUMN last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP;"))

        # Backfill defaults
        session.exec(text("UPDATE match SET countdown_secs = 300 WHERE countdown_secs IS NULL;"))
        session.exec(text("UPDATE matchplayer SET ready = 0 WHERE ready IS NULL;"))
        session.exec(text("UPDATE match SET last_active_at = created_at WHERE last_active_at IS NULL;"))
        session.commit()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _run_light_migrations()


def get_session() -> Generator[Session, None, None]:
    """提供 session，搭配 FastAPI Depends 使用"""
    # 對 SQLite 使用 autocommit 模式以減少鎖
    with Session(engine, expire_on_commit=False) as session:
        yield session
