from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Minesweeper API"
    db_url: str = "sqlite:///./minesweeper.db"
    # Allow both localhost and 127.0.0.1 by default; can be overridden via env var
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    jwt_secret: str = "change-me-secret"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 24 * 60

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
