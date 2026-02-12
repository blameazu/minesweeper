from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..db import get_session
from ..models import LeaderboardEntry
from ..schemas import LeaderboardCreate, LeaderboardRead
from .auth import get_current_user

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("", response_model=list[LeaderboardRead])
async def list_leaderboard(
    difficulty: str = Query(..., description="beginner/intermediate/expert/custom"),
    session: Session = Depends(get_session),
    limit: int = Query(10, ge=1, le=10)
):
    query = select(LeaderboardEntry)
    if difficulty:
        query = query.where(LeaderboardEntry.difficulty == difficulty)

    query = query.order_by(LeaderboardEntry.time_ms.asc(), LeaderboardEntry.created_at.asc())
    entries = session.exec(query).all()

    deduped: list[LeaderboardEntry] = []
    seen_handles: set[str] = set()
    for entry in entries:
        if entry.player in seen_handles:
            continue
        seen_handles.add(entry.player)
        deduped.append(entry)
        if len(deduped) >= limit:
            break

    return deduped


@router.post("", response_model=LeaderboardRead)
async def create_entry(payload: LeaderboardCreate, session: Session = Depends(get_session), user=Depends(get_current_user)):
    if payload.time_ms <= 0:
        raise HTTPException(status_code=400, detail="time_ms must be positive")
    if not user:
        raise HTTPException(status_code=401, detail="login required")

    handle = user.handle
    existing = session.exec(
        select(LeaderboardEntry).where(LeaderboardEntry.difficulty == payload.difficulty, LeaderboardEntry.player == handle)
    ).first()

    if existing:
        if payload.time_ms < existing.time_ms:
            existing.time_ms = payload.time_ms
            session.add(existing)
            session.commit()
            session.refresh(existing)
        return existing

    entry = LeaderboardEntry(
        player=handle,
        difficulty=payload.difficulty,
        time_ms=payload.time_ms,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry
