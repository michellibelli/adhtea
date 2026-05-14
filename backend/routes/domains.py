"""Project domain CRUD + lazy-seed of Work/Home defaults."""

import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Domain, Project, User
from schemas import DomainCreate, DomainUpdate, DomainResponse
from routes.auth import get_current_user

router = APIRouter(prefix="/domains", tags=["domains"])


# Default seed: Work = weekdays-only; Home = weekend-anything + weekday-evening-light
DEFAULT_DOMAINS = [
    {
        "name": "Work",
        "rules": [{"days": [0, 1, 2, 3, 4], "times": None, "weights": None}],
        "is_default": True,
    },
    {
        "name": "Home",
        "rules": [
            {"days": [0, 1, 2, 3, 4], "times": ["evening"], "weights": ["light"]},
            {"days": [5, 6], "times": None, "weights": None},
        ],
        "is_default": True,
    },
]


def _serialize(d: Domain) -> dict:
    return {
        "id": d.id, "user_id": d.user_id, "name": d.name,
        "is_default": d.is_default, "created_at": d.created_at,
        "rules": json.loads(d.rules or "[]"),
    }


def _ensure_defaults(user_id: int, db: Session):
    existing = db.query(Domain).filter(Domain.user_id == user_id, Domain.is_default == True).count()  # noqa: E712
    if existing >= len(DEFAULT_DOMAINS):
        return
    for seed in DEFAULT_DOMAINS:
        has = db.query(Domain).filter(
            Domain.user_id == user_id,
            Domain.name == seed["name"],
            Domain.is_default == True,  # noqa: E712
        ).first()
        if has:
            continue
        db.add(Domain(
            user_id=user_id,
            name=seed["name"],
            rules=json.dumps(seed["rules"]),
            is_default=seed["is_default"],
        ))
    db.commit()


@router.get("", response_model=list[DomainResponse])
def list_domains(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_defaults(current_user.id, db)
    rows = db.query(Domain).filter(Domain.user_id == current_user.id).order_by(Domain.id.asc()).all()
    return [_serialize(d) for d in rows]


@router.post("", response_model=DomainResponse)
def create_domain(
    body: DomainCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name required")
    d = Domain(
        user_id=current_user.id,
        name=body.name.strip(),
        rules=json.dumps([r.model_dump() for r in body.rules]),
        is_default=False,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return _serialize(d)


@router.patch("/{domain_id}", response_model=DomainResponse)
def update_domain(
    domain_id: int,
    body: DomainUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    d = db.query(Domain).filter(Domain.id == domain_id, Domain.user_id == current_user.id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Domain not found")
    patch = body.model_dump(exclude_unset=True)
    if "name" in patch and patch["name"]:
        d.name = patch["name"].strip()
    if "rules" in patch:
        d.rules = json.dumps(patch["rules"])
    db.commit()
    db.refresh(d)
    return _serialize(d)


@router.delete("/{domain_id}", status_code=204)
def delete_domain(
    domain_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    d = db.query(Domain).filter(Domain.id == domain_id, Domain.user_id == current_user.id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Domain not found")
    # Detach from projects using this domain
    db.query(Project).filter(Project.domain_id == d.id).update({"domain_id": None})
    db.delete(d)
    db.commit()
    return None
