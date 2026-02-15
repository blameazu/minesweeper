from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func

from ..db import get_session
from ..models import LeaderboardEntry, LeaderboardReplay, Match, MatchPlayer, MatchStatus, User
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
            has_replay = session.exec(select(LeaderboardReplay).where(LeaderboardReplay.entry_id == first.id)).first() is not None
            best.append(
                ProfileBestScore(
                    difficulty=diff,
                    time_ms=best_time,
                    created_at=first.created_at,
                    entry_id=first.id,
                    has_replay=has_replay,
                )
            )
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
    def _points_for(rank: int, total: int) -> int:
        if total < 2:
            return 0
        if total == 2:
            base = [10, 2]
            return base[rank - 1] if rank <= 2 else 1
        if total == 3:
            base = [14, 7, 2]
            return base[rank - 1] if rank <= 3 else 1
        if total == 4:
            base = [18, 10, 5, 2]
            return base[rank - 1] if rank <= 4 else 1
        value = round(25 * (1 - (rank - 1) / total) ** 1.1) + 1
        return max(value, 1)

    scores: dict[str, int] = {}

    # 1. 先把所有已註冊玩家加入，預設 0 分
    all_users = session.exec(select(User)).all()
    for u in all_users:
        scores[u.handle] = 0

    # 2. 計算比賽分數
    matches = session.exec(select(Match).where(Match.status == MatchStatus.finished)).all()
    for match in matches:
        players = session.exec(select(MatchPlayer).where(MatchPlayer.match_id == match.id)).all()
        if not players:
            continue
        standings = _compute_standings(match, players)
        total = len(standings)
        if total == 0:
            continue
        for rank, p in standings:
            # 以 handle 累加分數
            if p.user_id is not None:
                user = session.get(User, p.user_id)
                if user:
                    scores[user.handle] += _points_for(rank, total)

    # 3. 排序並取前 limit
    top_sorted = sorted(scores.items(), key=lambda x: (-x[1], x[0]))
    top_entries = [RankEntry(handle=h, score=c) for h, c in top_sorted[:limit]]

    # 4. me_entry
    me_entry = None
    if current_user_id is not None:
        user = session.get(User, current_user_id)
        if user:
            me_entry = RankEntry(handle=user.handle, score=scores.get(user.handle, 0))

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
