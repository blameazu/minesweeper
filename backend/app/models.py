from datetime import datetime
from enum import Enum
from typing import Optional
from sqlmodel import Field, SQLModel
from sqlalchemy import UniqueConstraint


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


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    handle: str = Field(index=True, max_length=50, sa_column_kwargs={"unique": True})
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


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
    last_active_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class MatchPlayer(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    match_id: int = Field(foreign_key="match.id", index=True)
    name: str = Field(max_length=50)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
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


class BlogPost(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str = Field(max_length=200)
    content: str = Field()
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class BlogComment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="blogpost.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    content: str = Field(max_length=1000)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class BlogVote(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "post_id", name="uq_blogvote_user_post"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="blogpost.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    value: int = Field(default=0)  # 1 for upvote, -1 for downvote
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LeaderboardReplay(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    entry_id: int = Field(foreign_key="leaderboardentry.id", index=True)
    player: str = Field(index=True, max_length=50)
    difficulty: str = Field(index=True)
    time_ms: int
    duration_ms: Optional[int] = None
    steps_count: int = Field(default=0)
    board_json: str  # JSON: {width,height,mines,seed,safe_start?,difficulty?}
    steps_json: str  # JSON array of steps
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
