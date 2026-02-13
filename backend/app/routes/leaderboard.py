import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..db import get_session
from ..models import LeaderboardEntry, LeaderboardReplay
from ..schemas import LeaderboardCreate, LeaderboardRead, LeaderboardReplayRead
from .auth import get_current_user

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


def _top_entries(session: Session, difficulty: str, limit: int = 10) -> list[LeaderboardEntry]:
    query = select(LeaderboardEntry).where(LeaderboardEntry.difficulty == difficulty)
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


@router.get("", response_model=list[LeaderboardRead])
async def list_leaderboard(
    difficulty: str = Query(..., description="beginner/intermediate/expert/custom"),
    session: Session = Depends(get_session),
    limit: int = Query(10, ge=1, le=10)
):
    entries = _top_entries(session, difficulty, limit)
    entry_ids = [e.id for e in entries if e.id]
    replay_ids: set[int] = set()
    if entry_ids:
        stmt = select(LeaderboardReplay.entry_id).where(LeaderboardReplay.entry_id.in_(entry_ids))
        replay_ids = set(r for r in session.exec(stmt).all())

    result: list[LeaderboardRead] = []
    for entry in entries:
        has_replay = bool(entry.id and entry.id in replay_ids)
        result.append(
            LeaderboardRead(
                id=entry.id,
                player=entry.player,
                handle=getattr(entry, "handle", None),
                difficulty=entry.difficulty,
                time_ms=entry.time_ms,
                created_at=entry.created_at,
                has_replay=has_replay,
            )
        )
    return result


def _save_replay(session: Session, entry: LeaderboardEntry, payload: LeaderboardCreate) -> None:
    if not payload.replay:
        return
    if not entry.id:
        return

    existing = session.exec(select(LeaderboardReplay).where(LeaderboardReplay.entry_id == entry.id)).first()
    if existing:
        session.delete(existing)
        session.commit()

    replay = LeaderboardReplay(
        entry_id=entry.id,
        player=entry.player,
        difficulty=entry.difficulty,
        time_ms=entry.time_ms,
        duration_ms=payload.replay.duration_ms,
        steps_count=len(payload.replay.steps),
        board_json=json.dumps(payload.replay.board.model_dump()),
        steps_json=json.dumps([step.model_dump() for step in payload.replay.steps]),
    )
    session.add(replay)
    session.commit()


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
            entry = existing
        else:
            entry = existing
    else:
        entry = LeaderboardEntry(
            player=handle,
            difficulty=payload.difficulty,
            time_ms=payload.time_ms,
        )
        session.add(entry)
        session.commit()
        session.refresh(entry)

    # Ensure top-10 entries have replay data.
    top_entries = _top_entries(session, payload.difficulty, 10)
    top_ids = {e.id for e in top_entries if e.id}
    if entry.id in top_ids:
        if not payload.replay:
            raise HTTPException(status_code=400, detail="replay required for top 10 entries")
        _save_replay(session, entry, payload)
    elif payload.replay:
        # Still accept replay even if not top-10 yet; will be used if later promoted.
        _save_replay(session, entry, payload)

    has_replay = bool(entry.id and entry.id in top_ids)
    replay_exists = False
    if entry.id:
        replay_exists = session.exec(select(LeaderboardReplay).where(LeaderboardReplay.entry_id == entry.id)).first() is not None
    return LeaderboardRead(
        id=entry.id,
        player=entry.player,
        handle=handle,
        difficulty=entry.difficulty,
        time_ms=entry.time_ms,
        created_at=entry.created_at,
        has_replay=replay_exists,
    )


@router.get("/{entry_id}/replay", response_model=LeaderboardReplayRead)
async def get_replay(entry_id: int, session: Session = Depends(get_session)):
    entry = session.get(LeaderboardEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="entry not found")
    replay = session.exec(select(LeaderboardReplay).where(LeaderboardReplay.entry_id == entry_id)).first()
    if not replay:
        raise HTTPException(status_code=404, detail="replay not found")

    board = json.loads(replay.board_json)
    steps = json.loads(replay.steps_json)
    return LeaderboardReplayRead(
        entry_id=entry_id,
        player=entry.player,
        difficulty=entry.difficulty,
        board=board,
        steps=steps,
        time_ms=replay.time_ms,
        duration_ms=replay.duration_ms,
        steps_count=replay.steps_count,
        created_at=replay.created_at,
    )
