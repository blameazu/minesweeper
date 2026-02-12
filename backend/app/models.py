from datetime import datetime
from enum import Enum
from typing import Optional
from sqlmodel import Field, SQLModel


class LeaderboardEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    player: str = Field(index=True, max_length=50)
    difficulty: str = Field(index=True)
    time_ms: int = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MatchStatus(str, Enum):
    pending = "pending"
    active = "active"
    finished = "finished"


class Match(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    status: MatchStatus = Field(default=MatchStatus.pending, index=True)
    width: int
    height: int
    mines: int
    seed: str
    difficulty: Optional[str] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    countdown_secs: int = Field(default=300)


class MatchPlayer(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    match_id: int = Field(foreign_key="match.id", index=True)
    name: str = Field(max_length=50)
    token: str = Field(index=True)
    result: Optional[str] = Field(default=None, index=True)  # win/lose/draw/forfeit
    duration_ms: Optional[int] = None
    steps_count: int = Field(default=0)
    finished_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    ready: bool = Field(default=False)
    progress: Optional[str] = Field(default=None)  # JSON string of client-provided progress snapshot


class MatchStep(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    match_id: int = Field(foreign_key="match.id", index=True)
    player_id: int = Field(foreign_key="matchplayer.id", index=True)
    action: str = Field(max_length=16)  # reveal/flag/chord
    x: int
    y: int
    elapsed_ms: Optional[int] = None
    seq: Optional[int] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
