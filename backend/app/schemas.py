from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, constr
from pydantic import ConfigDict


class LeaderboardCreate(BaseModel):
    player: constr(strip_whitespace=True, min_length=1, max_length=50)
    difficulty: str
    time_ms: int


class LeaderboardRead(BaseModel):
    id: int
    player: str
    difficulty: str
    time_ms: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MatchCreate(BaseModel):
    player: constr(strip_whitespace=True, min_length=1, max_length=50)
    width: int
    height: int
    mines: int
    seed: Optional[str] = None
    difficulty: Optional[str] = None


class MatchJoin(BaseModel):
    player: constr(strip_whitespace=True, min_length=1, max_length=50)


class MatchStatePlayer(BaseModel):
    id: int
    name: str
    result: Optional[str]
    duration_ms: Optional[int]
    steps_count: int
    finished_at: Optional[datetime]

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
    players: list[MatchStatePlayer]


class MatchCreateResponse(BaseModel):
    match_id: int
    player_id: int
    player_token: str
    board: dict


class MatchJoinResponse(BaseModel):
    match_id: int
    player_id: int
    player_token: str
    board: dict


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
