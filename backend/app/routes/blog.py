from typing import Dict, Tuple
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Request
from sqlalchemy import func, case
from sqlmodel import Session, select

from ..db import get_session
from ..models import BlogPost, BlogComment, BlogVote, User
from ..schemas import (
    BlogPostCreate,
    BlogPostItem,
    BlogPostDetail,
    BlogCommentCreate,
    BlogCommentRead,
    BlogVoteRequest,
)
from .auth import get_current_user, get_current_user_optional
from ..config import get_settings

settings = get_settings()
UPLOAD_DIR = Path(settings.upload_dir).resolve()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter(prefix="/api/blog", tags=["blog"])


def _stats_for_posts(session: Session, post_ids: list[int], user_id: int | None) -> Dict[int, Tuple[int, int, int, int | None]]:
    if not post_ids:
        return {}

    vote_rows = session.exec(
        select(
            BlogVote.post_id,
            func.sum(case((BlogVote.value == 1, 1), else_=0)).label("up"),
            func.sum(case((BlogVote.value == -1, 1), else_=0)).label("down"),
        ).where(BlogVote.post_id.in_(post_ids)).group_by(BlogVote.post_id)
    ).all()
    votes_map: Dict[int, Tuple[int, int]] = {pid: (up or 0, down or 0) for pid, up, down in vote_rows}

    comment_rows = session.exec(
        select(BlogComment.post_id, func.count().label("count")).where(BlogComment.post_id.in_(post_ids)).group_by(BlogComment.post_id)
    ).all()
    comments_map: Dict[int, int] = {pid: cnt for pid, cnt in comment_rows}

    my_votes_map: Dict[int, int | None] = {}
    if user_id is not None:
        my_rows = session.exec(
            select(BlogVote.post_id, BlogVote.value).where(BlogVote.user_id == user_id, BlogVote.post_id.in_(post_ids))
        ).all()
        my_votes_map = {pid: val for pid, val in my_rows}

    result: Dict[int, Tuple[int, int, int, int | None]] = {}
    for pid in post_ids:
        up, down = votes_map.get(pid, (0, 0))
        comments = comments_map.get(pid, 0)
        my_vote = my_votes_map.get(pid)
        result[pid] = (up, down, comments, my_vote)
    return result


def _post_to_item(post: BlogPost, author: str, stats: Tuple[int, int, int, int | None]) -> BlogPostItem:
    up, down, comment_count, my_vote = stats
    return BlogPostItem(
        id=post.id,
        title=post.title,
        content=post.content,
        author=author,
        created_at=post.created_at,
        updated_at=post.updated_at,
        upvotes=up,
        downvotes=down,
        score=up - down,
        comment_count=comment_count,
        my_vote=my_vote,
    )


@router.get("/posts", response_model=list[BlogPostItem])
async def list_posts(
    sort: str = Query("created", pattern="^(created|score)$"),
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    stmt = select(BlogPost, User.handle).join(User, BlogPost.user_id == User.id).order_by(BlogPost.created_at.desc()).limit(50)
    rows = session.exec(stmt).all()
    posts = [row[0] for row in rows]
    handles = {row[0].id: row[1] for row in rows if row[0].id is not None}
    stats = _stats_for_posts(session, [p.id for p in posts if p.id is not None], user.id if user else None)

    if sort == "score":
        posts.sort(key=lambda p: ((stats.get(p.id, (0, 0, 0, None))[0] - stats.get(p.id, (0, 0, 0, None))[1]), p.created_at), reverse=True)

    items: list[BlogPostItem] = []
    for p in posts[:20]:
        if p.id is None:
            continue
        item_stats = stats.get(p.id, (0, 0, 0, None))
        items.append(_post_to_item(p, handles.get(p.id, "匿名"), item_stats))
    return items


@router.post("/posts", response_model=BlogPostItem)
async def create_post(payload: BlogPostCreate, session: Session = Depends(get_session), user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    existing_count = session.exec(select(func.count()).select_from(BlogPost).where(BlogPost.user_id == user.id)).one()
    count_val = existing_count[0] if isinstance(existing_count, tuple) else existing_count
    if count_val >= 5:
        raise HTTPException(status_code=400, detail="每位使用者最多可發佈 5 篇文章")
    post = BlogPost(user_id=user.id, title=payload.title, content=payload.content)
    session.add(post)
    session.commit()
    session.refresh(post)
    stats = _stats_for_posts(session, [post.id], user.id)[post.id]
    return _post_to_item(post, user.handle, stats)


@router.put("/posts/{post_id}", response_model=BlogPostItem)
async def update_post(post_id: int, payload: BlogPostCreate, session: Session = Depends(get_session), user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    post = session.get(BlogPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    if post.user_id != user.id:
        raise HTTPException(status_code=403, detail="only author can edit")

    post.title = payload.title
    post.content = payload.content
    post.updated_at = datetime.utcnow()
    session.add(post)
    session.commit()
    session.refresh(post)

    stats = _stats_for_posts(session, [post.id], user.id)[post.id]
    return _post_to_item(post, user.handle, stats)


@router.get("/posts/mine", response_model=list[BlogPostItem])
async def list_my_posts(session: Session = Depends(get_session), user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    stmt = select(BlogPost).where(BlogPost.user_id == user.id).order_by(BlogPost.created_at.desc())
    posts = session.exec(stmt).all()
    stats = _stats_for_posts(session, [p.id for p in posts if p.id is not None], user.id)
    items: list[BlogPostItem] = []
    for p in posts:
        if p.id is None:
            continue
        item_stats = stats.get(p.id, (0, 0, 0, None))
        items.append(_post_to_item(p, user.handle, item_stats))
    return items


@router.get("/posts/{post_id}", response_model=BlogPostDetail)
async def get_post(post_id: int, session: Session = Depends(get_session), user=Depends(get_current_user_optional)):
    stmt = select(BlogPost, User.handle).join(User, BlogPost.user_id == User.id).where(BlogPost.id == post_id)
    row = session.exec(stmt).first()
    if not row:
        raise HTTPException(status_code=404, detail="post not found")
    post, author = row
    stats_map = _stats_for_posts(session, [post.id], user.id if user else None)
    stats = stats_map.get(post.id, (0, 0, 0, None))

    comment_rows = session.exec(
        select(BlogComment, User.handle)
        .join(User, BlogComment.user_id == User.id)
        .where(BlogComment.post_id == post.id)
        .order_by(BlogComment.created_at.asc())
    ).all()
    comments = [
        BlogCommentRead(id=c.id, post_id=c.post_id, user_id=c.user_id, author=handle, content=c.content, created_at=c.created_at)
        for c, handle in comment_rows
    ]

    item = _post_to_item(post, author, stats)
    return BlogPostDetail(**item.model_dump(), comments=comments)


@router.post("/posts/{post_id}/comments", response_model=BlogCommentRead)
async def add_comment(post_id: int, payload: BlogCommentCreate, session: Session = Depends(get_session), user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    post = session.get(BlogPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    comment = BlogComment(post_id=post_id, user_id=user.id, content=payload.content)
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return BlogCommentRead(id=comment.id, post_id=comment.post_id, user_id=comment.user_id, author=user.handle, content=comment.content, created_at=comment.created_at)


@router.post("/posts/{post_id}/vote", response_model=BlogPostItem)
async def vote_post(post_id: int, payload: BlogVoteRequest, session: Session = Depends(get_session), user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    post = session.get(BlogPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="post not found")

    stmt_vote = select(BlogVote).where(BlogVote.post_id == post_id, BlogVote.user_id == user.id)
    existing = session.exec(stmt_vote).first()

    if payload.value == 0:
        if existing:
            session.delete(existing)
            session.commit()
    else:
        if existing:
            existing.value = payload.value
            session.add(existing)
        else:
            session.add(BlogVote(post_id=post_id, user_id=user.id, value=payload.value))
        session.commit()

    session.refresh(post)
    stats_map = _stats_for_posts(session, [post.id], user.id)
    stats = stats_map.get(post.id, (0, 0, 0, None))
    author = session.get(User, post.user_id).handle if post.user_id else "匿名"
    return _post_to_item(post, author, stats)


@router.delete("/posts/{post_id}", status_code=204)
async def delete_post(post_id: int, session: Session = Depends(get_session), user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    post = session.get(BlogPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    if post.user_id != user.id:
        raise HTTPException(status_code=403, detail="only author can delete")

    # remove votes and comments before deleting the post
    comments = session.exec(select(BlogComment).where(BlogComment.post_id == post_id)).all()
    for c in comments:
        session.delete(c)
    votes = session.exec(select(BlogVote).where(BlogVote.post_id == post_id)).all()
    for v in votes:
        session.delete(v)
    session.delete(post)
    session.commit()
    return None


@router.post("/upload-image")
async def upload_image(request: Request, file: UploadFile = File(...), user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="login required")

    allowed_types = {"image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/gif": ".gif", "image/webp": ".webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="僅支援圖片上傳 (png/jpg/gif/webp)")

    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="圖片大小上限 2MB")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed_types.values():
        ext = allowed_types[file.content_type]

    filename = f"{uuid4().hex}{ext}"
    dest = UPLOAD_DIR / filename
    with open(dest, "wb") as f:
        f.write(data)

    base = str(request.base_url).rstrip("/")
    return {"url": f"/uploads/{filename}", "absolute_url": f"{base}/uploads/{filename}"}
