from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, constr
from pydantic import ConfigDict


class LeaderboardCreate(BaseModel):
    player: constr(strip_whitespace=True, min_length=1, max_length=50) | None = None
    difficulty: str
    time_ms: int


class LeaderboardRead(BaseModel):
    id: int
    player: str
    handle: str | None = None
    difficulty: str
    time_ms: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MatchCreate(BaseModel):
    # Frontend no longer sends player; backend uses current user handle.
    player: Optional[str] = None
    width: int
    height: int
    mines: int
    seed: Optional[str] = None
    difficulty: Optional[str] = None
    countdown_secs: Optional[int] = None


class MatchJoin(BaseModel):
    # Frontend does not need to send this; keep optional for backward compatibility.
    player: Optional[str] = None


class MatchStatePlayer(BaseModel):
    id: int
    name: str
    result: Optional[str]
    duration_ms: Optional[int]
    steps_count: int
    finished_at: Optional[datetime]
    ready: bool
    progress: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)


class MatchState(BaseModel):
    id: int
    status: str
    width: int
    height: int
    mines: int
    seed: str
    difficulty: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    countdown_secs: int
    safe_start: dict
    host_id: Optional[int]
    players: list[MatchStatePlayer]


class MatchCreateResponse(BaseModel):
    countdown_secs: int
    match_id: int
    player_id: int
    player_token: str
    board: dict
    host_id: Optional[int] = None


class MatchJoinResponse(BaseModel):
    match_id: int
    player_id: int
    player_token: str
    board: dict
    host_id: Optional[int] = None


class MatchStepCreate(BaseModel):
    player_token: str
    action: Literal["reveal", "flag", "chord"]
    x: int
    y: int
    elapsed_ms: Optional[int] = None


class MatchFinish(BaseModel):
    player_token: str
    outcome: Literal["win", "lose", "draw", "forfeit"]
    duration_ms: Optional[int] = None
    steps_count: Optional[int] = None
    progress: Optional[dict] = None


class MatchReady(BaseModel):
    player_token: str
    ready: bool = True


class MatchDelete(BaseModel):
    player_token: str


class UserCreate(BaseModel):
    handle: constr(strip_whitespace=True, pattern=r"^[A-Za-z0-9]{3,50}$")
    password: constr(min_length=6, max_length=72)


class UserRead(BaseModel):
    id: int
    handle: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MatchStepRead(BaseModel):
    player_name: str
    action: str
    x: int
    y: int
    elapsed_ms: Optional[int]
    created_at: datetime
    seq: Optional[int]

    model_config = ConfigDict(from_attributes=True)


class MatchHistoryItem(BaseModel):
    match_id: int
    status: str
    created_at: datetime
    ended_at: Optional[datetime]
    difficulty: Optional[str]
    width: int
    height: int
    mines: int
    result: Optional[str]
    duration_ms: Optional[int]

    model_config = ConfigDict(from_attributes=True)


class ProfileBestScore(BaseModel):
    difficulty: str
    time_ms: int
    created_at: datetime


class ProfileResponse(BaseModel):
    handle: str
    best_scores: list[ProfileBestScore]
    match_history: list[MatchHistoryItem]


class RecentMatchPlayer(BaseModel):
    name: str
    result: Optional[str]
    ready: Optional[bool] = None


class RecentMatch(BaseModel):
    match_id: int
    status: str
    created_at: datetime
    ended_at: Optional[datetime]
    difficulty: Optional[str]
    width: int
    height: int
    mines: int
    players: list[RecentMatchPlayer]
