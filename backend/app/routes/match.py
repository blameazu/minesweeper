from datetime import datetime, timedelta
import json
import secrets
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Match, MatchPlayer, MatchStatus, MatchStep
from ..schemas import (
    MatchCreate,
    MatchCreateResponse,
    MatchFinish,
    MatchHistoryItem,
    MatchJoin,
    MatchJoinResponse,
    MatchState,
    MatchStatePlayer,
    MatchStepCreate,
    MatchStepRead,
    MatchReady,
    MatchDelete,
    RecentMatch,
    RecentMatchPlayer,
)
from .auth import get_current_user

router = APIRouter(prefix="/api/match", tags=["match"])


def _get_match(session: Session, match_id: int) -> Match:
    match = session.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=404, detail="match not found")
    return match


def _get_player_by_token(session: Session, token: str) -> Optional[MatchPlayer]:
    stmt = select(MatchPlayer).where(MatchPlayer.token == token)
    return session.exec(stmt).first()


def _ensure_joinable(session: Session, match: Match) -> None:
    if match.status not in {MatchStatus.pending, MatchStatus.active}:
        raise HTTPException(status_code=400, detail="match already finished")
    stmt = select(MatchPlayer).where(MatchPlayer.match_id == match.id)
    players = session.exec(stmt).all()
    if len(players) >= 2:
        raise HTTPException(status_code=400, detail="match already has two players")


def _list_players(session: Session, match: Match) -> list[MatchPlayer]:
    stmt = select(MatchPlayer).where(MatchPlayer.match_id == match.id)
    return session.exec(stmt).all()


def _player_to_schema(player: MatchPlayer) -> MatchStatePlayer:
    progress = None
    if player.progress:
        try:
            progress = json.loads(player.progress)
        except json.JSONDecodeError:
            progress = None
    return MatchStatePlayer(
        id=player.id,
        name=player.name,
        result=player.result,
        duration_ms=player.duration_ms,
        steps_count=player.steps_count,
        finished_at=player.finished_at,
        ready=player.ready,
        progress=progress,
    )


def _apply_timeout(session: Session, match: Match) -> list[MatchPlayer]:
    players = _list_players(session, match)
    if match.status == MatchStatus.finished or not match.started_at:
        return players

    countdown_secs = match.countdown_secs or 300
    deadline = match.started_at + timedelta(seconds=countdown_secs)
    now = datetime.utcnow()
    if now < deadline:
        return players

    unfinished = [p for p in players if not p.result]
    if unfinished:
        if len(unfinished) == len(players):
            for p in unfinished:
                p.result = "draw"
                p.finished_at = now
        else:
            for p in unfinished:
                p.result = "lose"
                p.finished_at = now
    match.status = MatchStatus.finished
    match.ended_at = now

    session.commit()
    session.refresh(match)
    return _list_players(session, match)


@router.post("", response_model=MatchCreateResponse)
async def create_match(payload: MatchCreate, session: Session = Depends(get_session), user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    match = Match(
        width=payload.width,
        height=payload.height,
        mines=payload.mines,
        seed=payload.seed or secrets.token_hex(8),
        difficulty=payload.difficulty,
        countdown_secs=payload.countdown_secs if payload.countdown_secs is not None else 300,
    )
    session.add(match)
    session.commit()
    session.refresh(match)

    token = secrets.token_urlsafe(16)
    player = MatchPlayer(match_id=match.id, name=user.handle, user_id=user.id, token=token)
    session.add(player)
    session.commit()
    session.refresh(player)

    return MatchCreateResponse(
        countdown_secs=match.countdown_secs,
        match_id=match.id,
        player_id=player.id,
        player_token=token,
        board={"width": match.width, "height": match.height, "mines": match.mines, "seed": match.seed},
    )


@router.post("/{match_id}/join", response_model=MatchJoinResponse)
async def join_match(match_id: int, payload: MatchJoin, session: Session = Depends(get_session), user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    match = _get_match(session, match_id)
    _ensure_joinable(session, match)

    existing_players = _list_players(session, match)
    if any(p.user_id == user.id for p in existing_players):
        raise HTTPException(status_code=400, detail="cannot join own match")
    if any(p.name == user.handle for p in existing_players):
        raise HTTPException(status_code=400, detail="handle already in match")

    token = secrets.token_urlsafe(16)
    player = MatchPlayer(match_id=match.id, name=user.handle, user_id=user.id, token=token)
    session.add(player)

    session.commit()
    session.refresh(player)
    session.refresh(match)

    return MatchJoinResponse(
        match_id=match.id,
        player_id=player.id,
        player_token=token,
        board={"width": match.width, "height": match.height, "mines": match.mines, "seed": match.seed},
    )


@router.post("/{match_id}/ready")
async def set_ready(match_id: int, payload: MatchReady, session: Session = Depends(get_session)):
    match = _get_match(session, match_id)
    player = _get_player_by_token(session, payload.player_token)
    if not player or player.match_id != match.id:
        raise HTTPException(status_code=403, detail="invalid player token")
    if match.status == MatchStatus.finished:
        raise HTTPException(status_code=400, detail="match finished")

    player.ready = payload.ready
    players = _list_players(session, match)
    if len(players) == 2 and all(p.ready for p in players) and match.status != MatchStatus.finished:
        match.status = MatchStatus.active
        start_delay = 10
        now = datetime.utcnow()
        match.started_at = match.started_at or now + timedelta(seconds=start_delay)
        if not match.countdown_secs:
            match.countdown_secs = 300

    session.commit()
    session.refresh(match)
    return {"ok": True, "status": match.status.value, "started_at": match.started_at, "countdown_secs": match.countdown_secs}


@router.get("/{match_id}/state", response_model=MatchState)
async def get_match_state(match_id: int, session: Session = Depends(get_session)):
    match = _get_match(session, match_id)
    players = _apply_timeout(session, match)
    countdown_secs = match.countdown_secs or 300
    return MatchState(
        id=match.id,
        status=match.status.value,
        width=match.width,
        height=match.height,
        mines=match.mines,
        seed=match.seed,
        difficulty=match.difficulty,
        created_at=match.created_at,
        started_at=match.started_at,
        ended_at=match.ended_at,
        countdown_secs=countdown_secs,
        players=[_player_to_schema(p) for p in players],
    )


@router.post("/{match_id}/step")
async def submit_step(match_id: int, payload: MatchStepCreate, session: Session = Depends(get_session)):
    match = _get_match(session, match_id)
    player = _get_player_by_token(session, payload.player_token)
    if not player or player.match_id != match.id:
        raise HTTPException(status_code=403, detail="invalid player token")
    players = _apply_timeout(session, match)
    if match.status != MatchStatus.active:
        raise HTTPException(status_code=400, detail="match not active")
    if match.started_at and datetime.utcnow() < match.started_at:
        raise HTTPException(status_code=400, detail="match not started")

    stmt = select(MatchStep).where(MatchStep.match_id == match.id, MatchStep.player_id == player.id).order_by(MatchStep.seq.desc())
    last_step = session.exec(stmt).first()
    next_seq = (last_step.seq or 0) + 1 if last_step else 1

    step = MatchStep(
        match_id=match.id,
        player_id=player.id,
        action=payload.action,
        x=payload.x,
        y=payload.y,
        elapsed_ms=payload.elapsed_ms,
        seq=next_seq,
    )
    player.steps_count = next_seq
    session.add(step)
    session.commit()
    return {"ok": True}


@router.post("/{match_id}/finish")
async def finish_match(match_id: int, payload: MatchFinish, session: Session = Depends(get_session)):
    match = _get_match(session, match_id)
    player = _get_player_by_token(session, payload.player_token)
    if not player or player.match_id != match.id:
        raise HTTPException(status_code=403, detail="invalid player token")

    players = _apply_timeout(session, match)
    if player.result:
        if payload.progress is not None and player.progress is None:
            player.progress = json.dumps(payload.progress)
            session.commit()
        return {"ok": True}

    now = datetime.utcnow()
    player.result = payload.outcome
    player.duration_ms = payload.duration_ms
    player.steps_count = payload.steps_count or player.steps_count
    player.finished_at = now
    if payload.progress is not None:
        player.progress = json.dumps(payload.progress)

    # Determine match status/outcomes
    players = _list_players(session, match)
    other_players = [p for p in players if p.id != player.id]

    if payload.outcome == "win":
        match.status = MatchStatus.finished
        match.ended_at = now
        for op in other_players:
            if not op.result:
                op.result = "lose"
                op.finished_at = now
    elif payload.outcome == "lose":
        match.status = MatchStatus.finished
        match.ended_at = now
        for op in other_players:
            if not op.result:
                op.result = "win"
                op.finished_at = now
    else:
        # if all players have a result, finish the match
        if all(p.result for p in players):
            match.status = MatchStatus.finished
            match.ended_at = now

    session.commit()
    return {"ok": True}


@router.delete("/{match_id}")
async def delete_match(match_id: int, payload: MatchDelete, session: Session = Depends(get_session)):
    match = _get_match(session, match_id)
    player = _get_player_by_token(session, payload.player_token)
    if not player or player.match_id != match.id:
        raise HTTPException(status_code=403, detail="invalid player token")

    players = _list_players(session, match)
    if len(players) > 1:
        raise HTTPException(status_code=400, detail="cannot delete match with multiple players")

    now = datetime.utcnow()
    if match.started_at and now >= match.started_at:
        raise HTTPException(status_code=400, detail="cannot delete a started match")

    # delete steps, players, then match
    steps_stmt = select(MatchStep).where(MatchStep.match_id == match.id)
    for step in session.exec(steps_stmt):
        session.delete(step)

    players_stmt = select(MatchPlayer).where(MatchPlayer.match_id == match.id)
    for p in session.exec(players_stmt):
        session.delete(p)

    session.delete(match)
    session.commit()
    return {"ok": True, "deleted": True}


@router.get("/{match_id}/steps", response_model=list[MatchStepRead])
async def list_steps(match_id: int, session: Session = Depends(get_session)):
    match = _get_match(session, match_id)
    stmt = (
        select(MatchStep, MatchPlayer.name)
        .join(MatchPlayer, MatchStep.player_id == MatchPlayer.id)
        .where(MatchStep.match_id == match.id)
        .order_by(MatchStep.created_at.asc(), MatchStep.id.asc())
    )
    rows = session.exec(stmt).all()
    return [
        MatchStepRead(
            player_name=name,
            action=step.action,
            x=step.x,
            y=step.y,
            elapsed_ms=step.elapsed_ms,
            created_at=step.created_at,
            seq=step.seq,
        )
        for step, name in rows
    ]


@router.get("/history", response_model=list[MatchHistoryItem])
async def match_history(player: str, session: Session = Depends(get_session)):
    stmt = select(MatchPlayer, Match).join(Match, MatchPlayer.match_id == Match.id).where(MatchPlayer.name == player)
    rows = session.exec(stmt).all()
    history: list[MatchHistoryItem] = []
    for mp, match in rows:
        _apply_timeout(session, match)
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


@router.get("/recent", response_model=list[RecentMatch])
async def recent_matches(session: Session = Depends(get_session)):
    stmt_matches = select(Match).order_by(Match.created_at.desc()).limit(10)
    matches = session.exec(stmt_matches).all()

    match_ids = [m.id for m in matches if m.id is not None]
    players_by_match: dict[int, list[MatchPlayer]] = {mid: [] for mid in match_ids}
    if match_ids:
        stmt_players = select(MatchPlayer).where(MatchPlayer.match_id.in_(match_ids))
        for player in session.exec(stmt_players).all():
            players_by_match.setdefault(player.match_id, []).append(player)

    recent: list[RecentMatch] = []
    for match in matches:
        _apply_timeout(session, match)
        players = players_by_match.get(match.id, []) if match.id is not None else []
        recent.append(
            RecentMatch(
                match_id=match.id,
                status=match.status.value,
                created_at=match.created_at,
                ended_at=match.ended_at,
                difficulty=match.difficulty,
                width=match.width,
                height=match.height,
                mines=match.mines,
                players=[RecentMatchPlayer(name=p.name, result=p.result, ready=p.ready) for p in players],
            )
        )

    return recent