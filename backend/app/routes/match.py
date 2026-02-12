from datetime import datetime
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
)

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


@router.post("", response_model=MatchCreateResponse)
async def create_match(payload: MatchCreate, session: Session = Depends(get_session)):
    match = Match(
        width=payload.width,
        height=payload.height,
        mines=payload.mines,
        seed=payload.seed or secrets.token_hex(8),
        difficulty=payload.difficulty,
    )
    session.add(match)
    session.commit()
    session.refresh(match)

    token = secrets.token_urlsafe(16)
    player = MatchPlayer(match_id=match.id, name=payload.player, token=token)
    session.add(player)
    session.commit()
    session.refresh(player)

    return MatchCreateResponse(
        match_id=match.id,
        player_id=player.id,
        player_token=token,
        board={"width": match.width, "height": match.height, "mines": match.mines, "seed": match.seed},
    )


@router.post("/{match_id}/join", response_model=MatchJoinResponse)
async def join_match(match_id: int, payload: MatchJoin, session: Session = Depends(get_session)):
    match = _get_match(session, match_id)
    _ensure_joinable(session, match)

    token = secrets.token_urlsafe(16)
    player = MatchPlayer(match_id=match.id, name=payload.player, token=token)
    session.add(player)

    # If this is the second player, mark match as active
    stmt = select(MatchPlayer).where(MatchPlayer.match_id == match.id)
    existing = session.exec(stmt).all()
    if len(existing) == 1:
        match.status = MatchStatus.active
        match.started_at = datetime.utcnow()

    session.commit()
    session.refresh(player)
    session.refresh(match)

    return MatchJoinResponse(
        match_id=match.id,
        player_id=player.id,
        player_token=token,
        board={"width": match.width, "height": match.height, "mines": match.mines, "seed": match.seed},
    )


@router.get("/{match_id}/state", response_model=MatchState)
async def get_match_state(match_id: int, session: Session = Depends(get_session)):
    match = _get_match(session, match_id)
    stmt = select(MatchPlayer).where(MatchPlayer.match_id == match.id)
    players = session.exec(stmt).all()
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
        players=[MatchStatePlayer.model_validate(p) for p in players],
    )


@router.post("/{match_id}/step")
async def submit_step(match_id: int, payload: MatchStepCreate, session: Session = Depends(get_session)):
    match = _get_match(session, match_id)
    player = _get_player_by_token(session, payload.player_token)
    if not player or player.match_id != match.id:
        raise HTTPException(status_code=403, detail="invalid player token")
    if match.status == MatchStatus.finished:
        raise HTTPException(status_code=400, detail="match finished")

    if match.status == MatchStatus.pending:
        match.status = MatchStatus.active
        match.started_at = match.started_at or datetime.utcnow()

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

    if player.result:
        return {"ok": True}

    now = datetime.utcnow()
    player.result = payload.outcome
    player.duration_ms = payload.duration_ms
    player.steps_count = payload.steps_count or player.steps_count
    player.finished_at = now

    # Determine match status/outcomes
    stmt = select(MatchPlayer).where(MatchPlayer.match_id == match.id)
    players = session.exec(stmt).all()
    other_players = [p for p in players if p.id != player.id]

    if payload.outcome == "win":
        match.status = MatchStatus.finished
        match.ended_at = now
        for op in other_players:
            if not op.result:
                op.result = "lose"
                op.finished_at = now
    else:
        # if all players have a result, finish the match
        if all(p.result for p in players):
            match.status = MatchStatus.finished
            match.ended_at = now

    session.commit()
    return {"ok": True}


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