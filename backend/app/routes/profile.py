from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func

from ..db import get_session
from ..models import LeaderboardEntry, Match, MatchPlayer, MatchStatus
from ..schemas import ProfileResponse, ProfileBestScore, MatchHistoryItem
from ..schemas import RankBoard, RankEntry
from .match import _compute_standings
from .auth import get_current_user, get_current_user_optional

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


def _rank_counts(session: Session, user_id: int) -> dict:
    counts = {"first": 0, "second": 0, "third": 0, "last": 0}
    matches = session.exec(
        select(Match)
        .join(MatchPlayer, MatchPlayer.match_id == Match.id)
        .where(MatchPlayer.user_id == user_id, Match.status == MatchStatus.finished)
    ).all()

    for match in matches:
        players = session.exec(select(MatchPlayer).where(MatchPlayer.match_id == match.id)).all()
        if not players:
            continue
        standings = _compute_standings(match, players)
        total = len(players)
        rank_map = {p.id: r for r, p in standings}
        user_player = next((p for p in players if p.user_id == user_id), None)
        if not user_player:
            continue
        rank = rank_map.get(user_player.id)
        if rank is None:
            continue
        if rank == 1:
            counts["first"] += 1
        if rank == 2:
            counts["second"] += 1
        if rank == 3:
            counts["third"] += 1
        if rank == total:
            counts["last"] += 1

    return counts


def _first_place_board(session: Session, current_user_id: int | None, limit: int = 20) -> RankBoard:
    wins: dict[str, int] = {}
    matches = session.exec(select(Match).where(Match.status == MatchStatus.finished)).all()
    for match in matches:
        players = session.exec(select(MatchPlayer).where(MatchPlayer.match_id == match.id)).all()
        if not players:
            continue
        standings = _compute_standings(match, players)
        if not standings:
            continue
        rank1_players = [p for r, p in standings if r == 1]
        for p in rank1_players:
            wins[p.name] = wins.get(p.name, 0) + 1

    top_sorted = sorted(wins.items(), key=lambda x: (-x[1], x[0]))
    top_entries = [RankEntry(handle=h, first=c) for h, c in top_sorted[:limit]]

    me_entry = None
    if current_user_id is not None:
        me_players = session.exec(select(MatchPlayer).where(MatchPlayer.user_id == current_user_id)).all()
        if me_players:
            handle = me_players[0].name
            me_entry = RankEntry(handle=handle, first=wins.get(handle, 0))

    return RankBoard(top=top_entries, me=me_entry)

@router.get("/me", response_model=ProfileResponse)
async def profile_me(session: Session = Depends(get_session), user=Depends(get_current_user)):
    if not user:
        return ProfileResponse(handle="", best_scores=[], match_history=[], rank_counts={"first": 0, "second": 0, "third": 0, "last": 0})

    best_scores = _best_scores(session, user.handle)
    match_history = _match_history(session, user.id)
    rank_counts = _rank_counts(session, user.id)
    return ProfileResponse(handle=user.handle, best_scores=best_scores, match_history=match_history, rank_counts=rank_counts)


@router.get("/rankings", response_model=RankBoard)
async def rank_board(session: Session = Depends(get_session), user=Depends(get_current_user_optional)):
    return _first_place_board(session, user.id if user else None, limit=20)
