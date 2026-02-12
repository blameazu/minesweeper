from datetime import datetime
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
