from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel


class LeaderboardEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    player: str = Field(index=True, max_length=50)
    difficulty: str = Field(index=True)
    time_ms: int = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
