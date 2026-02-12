from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..db import get_session
from ..models import LeaderboardEntry
from ..schemas import LeaderboardCreate, LeaderboardRead

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("", response_model=list[LeaderboardRead])
async def list_leaderboard(
    difficulty: str = Query(..., description="beginner/intermediate/expert/custom"),
    session: Session = Depends(get_session),
    limit: int = Query(20, ge=1, le=100)
):
    stmt = (
        select(LeaderboardEntry)
        .where(LeaderboardEntry.difficulty == difficulty)
        .order_by(LeaderboardEntry.time_ms.asc(), LeaderboardEntry.created_at.asc())
        .limit(limit)
    )
    results = session.exec(stmt).all()
    return results


@router.post("", response_model=LeaderboardRead)
async def create_entry(payload: LeaderboardCreate, session: Session = Depends(get_session)):
    if payload.time_ms <= 0:
        raise HTTPException(status_code=400, detail="time_ms must be positive")

    entry = LeaderboardEntry(
        player=payload.player,
        difficulty=payload.difficulty,
        time_ms=payload.time_ms,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry
