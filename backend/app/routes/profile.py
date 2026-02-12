from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func

from ..db import get_session
from ..models import LeaderboardEntry, Match, MatchPlayer
from ..schemas import ProfileResponse, ProfileBestScore, MatchHistoryItem
from .auth import get_current_user

router = APIRouter(prefix="/api/profile", tags=["profile"])


def _best_scores(session: Session, handle: str) -> list[ProfileBestScore]:
    stmt = (
        select(LeaderboardEntry.difficulty, func.min(LeaderboardEntry.time_ms).label("best_time"))
        .where(LeaderboardEntry.player == handle)
        .group_by(LeaderboardEntry.difficulty)
    )
    rows = session.exec(stmt).all()
    best: list[ProfileBestScore] = []
    for diff, best_time in rows:
        # fetch the earliest entry with that best time for timestamp
        first = (
            session.exec(
                select(LeaderboardEntry)
                .where(LeaderboardEntry.player == handle, LeaderboardEntry.difficulty == diff, LeaderboardEntry.time_ms == best_time)
                .order_by(LeaderboardEntry.created_at.asc())
            ).first()
        )
        if first:
            best.append(ProfileBestScore(difficulty=diff, time_ms=best_time, created_at=first.created_at))
    return best


def _match_history(session: Session, user_id: int, limit: int = 30) -> list[MatchHistoryItem]:
    stmt = (
        select(MatchPlayer, Match)
        .join(Match, MatchPlayer.match_id == Match.id)
        .where(MatchPlayer.user_id == user_id)
        .order_by(Match.created_at.desc())
        .limit(limit)
    )
    rows = session.exec(stmt).all()
    history: list[MatchHistoryItem] = []
    for mp, match in rows:
        history.append(
            MatchHistoryItem(
                match_id=match.id,
                status=match.status.value,
                created_at=match.created_at,
                ended_at=match.ended_at,
                difficulty=match.difficulty,
                width=match.width,
                height=match.height,
                mines=match.mines,
                result=mp.result,
                duration_ms=mp.duration_ms,
            )
        )
    return history


@router.get("/me", response_model=ProfileResponse)
async def profile_me(session: Session = Depends(get_session), user=Depends(get_current_user)):
    if not user:
        return ProfileResponse(handle="", best_scores=[], match_history=[])

    best_scores = _best_scores(session, user.handle)
    match_history = _match_history(session, user.id)
    return ProfileResponse(handle=user.handle, best_scores=best_scores, match_history=match_history)
