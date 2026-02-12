from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Minesweeper API"
    db_url: str = "sqlite:///./minesweeper.db"
    cors_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
