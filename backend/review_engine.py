"""Morning-review guess engine.

One cheap Haiku call each morning does two jobs at once:
  1. classifies the prior day's finished tasks small vs big (effort), and
  2. writes ONE warm, optimistic, sunny sentence to open her day.

Deciding small-vs-big is the friction we're removing, so the guesses are
pre-filled and she only flips the wrong ones. Her corrections are stored in
EffortExample and fed back as few-shot examples + exact-title overrides, so the
guesses sharpen week over week.

If Haiku is slow or the key is missing (Render cold start), everything falls
back to a keyword heuristic + a rotating sunny line — the review never blocks
the morning gate, it just guesses a little worse.
"""

import os
import json
import random

from sqlalchemy.orm import Session

from models import Task, EffortExample, Effort, utcnow

HAIKU_MODEL = "claude-haiku-4-5-20251001"

# Rotating sunny fallback greetings — used only when Haiku is unavailable.
# Always upbeat; {weekday} is filled in.
_SUNNY_FALLBACKS = [
    "New day, fresh start — {weekday}'s yours to make good. ☀️",
    "Good morning! It's {weekday} and you've got everything you need for today.",
    "{weekday} already — one step at a time, you've got this. ☀️",
    "Fresh page, {weekday} morning. Today's going to be a good one.",
    "Rise and shine — {weekday}'s wide open and full of possibility. ☀️",
]

# Keyword heuristic for the fallback path. Quick errands -> small; anything
# that implies focus or a chunk of time -> big. When nothing matches, default
# to small (deciding "big" wrongly costs her more than deciding "small").
_BIG_HINTS = (
    "draft", "write", "plan", "clean", "sort", "organize", "fix", "build",
    "research", "prepare", "prep", "review", "sched", "file", "paperwork",
    "appointment", "meeting", "cook", "laundry", "budget", "taxes", "deep",
    "sort out", "figure out", "set up", "move", "pack", "paint",
)
_SMALL_HINTS = (
    "call", "text", "email", "pay", "reply", "book", "order", "confirm",
    "check", "send", "remind", "rsvp", "sign", "log", "water", "vitamin",
    "take out", "quick",
)


def _heuristic_effort(title: str) -> str:
    t = (title or "").lower()
    if any(h in t for h in _BIG_HINTS):
        return "big"
    if any(h in t for h in _SMALL_HINTS):
        return "small"
    # No signal: long titles tend to be bigger jobs.
    return "big" if len(t) > 45 else "small"


def _fallback_greeting(weekday: str) -> str:
    return random.choice(_SUNNY_FALLBACKS).format(weekday=weekday or "today")


def _load_examples(db: Session, user_id: int, limit: int = 15):
    """Her most recent distinct (title -> effort) corrections.

    Returns (overrides, few_shot):
      overrides — {lowercased_title: "small"|"big"} for exact-title reuse
      few_shot  — list of (title, effort) most-recent-first, for the prompt
    """
    rows = (
        db.query(EffortExample)
        .filter(EffortExample.user_id == user_id)
        .order_by(EffortExample.updated_at.desc())
        .limit(limit)
        .all()
    )
    overrides = {r.title_key: r.effort.value for r in rows}
    few_shot = [(r.title_key, r.effort.value) for r in rows]
    return overrides, few_shot


def record_corrections(db: Session, user_id: int, items):
    """Upsert committed (title -> effort) tags into the learning store, keyed on
    the lowercased title so the same task re-uses her latest answer. `items` is
    a list of (title, effort_str)."""
    for title, effort_str in items:
        key = (title or "").strip().lower()[:500]
        if not key or effort_str not in ("small", "big"):
            continue
        row = (
            db.query(EffortExample)
            .filter(EffortExample.user_id == user_id, EffortExample.title_key == key)
            .first()
        )
        if row:
            row.effort = Effort(effort_str)
            row.updated_at = utcnow()
        else:
            db.add(EffortExample(user_id=user_id, title_key=key, effort=Effort(effort_str)))


def _haiku_call(key: str, tasks, context: dict, few_shot):
    """One batched call: returns (greeting, {task_id: "small"|"big"}). Raises on
    any failure so the caller can fall back."""
    import anthropic

    client = anthropic.Anthropic(api_key=key)

    system = (
        "You help the user, who has ADHD, start her day.\n"
        'Return JSON only: {"greeting": string, "tasks": [{"id": int, '
        '"effort": "small"|"big"}]}\n\n'
        "greeting: ONE warm, optimistic, sunny sentence to open her day. Always "
        "upbeat and bright — never neutral, never cautionary, never clinical, no "
        "hedging. Light and encouraging. May nod to the day of week or what she "
        "finished yesterday. End on a sunny note. Max ~20 words.\n\n"
        "effort: classify the effort each task took. \"small\" = quick / "
        "low-effort (a call, a text, a payment, an errand). \"big\" = real focus "
        "or a chunk of time (drafting, planning, cleaning, sorting, fixing, "
        "prep). When unsure, prefer \"small\"."
    )

    lines = [
        f"Day: {context.get('weekday','')}, {context.get('date','')}",
        f"Yesterday she finished {context.get('done_count', 0)} tasks.",
    ]
    if context.get("sleep_hours") is not None:
        lines.append(f"Sleep last night: {context['sleep_hours']}h.")
    if context.get("mood") is not None:
        lines.append(f"Mood: {context['mood']}/5.")
    if context.get("trend"):
        lines.append(f"This week's output: {context['trend']}.")
    lines.append("\nTasks to classify:")
    for t in tasks:
        lines.append(f'- id {t.id}: "{t.title}"')
    if few_shot:
        lines.append("\nPast corrections (reuse these where a task matches):")
        for title, effort in few_shot:
            lines.append(f'- "{title}" -> {effort}')

    msg = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": "\n".join(lines)}],
    )

    raw = msg.content[0].text.strip()
    if raw.startswith("```"):
        parts = raw.split("\n")
        end = -1 if parts[-1].strip() == "```" else len(parts)
        raw = "\n".join(parts[1:end])
    data = json.loads(raw)

    greeting = (data.get("greeting") or "").strip()
    effort_by_id = {}
    for item in data.get("tasks", []):
        try:
            tid = int(item["id"])
        except (KeyError, ValueError, TypeError):
            continue
        eff = item.get("effort")
        if eff in ("small", "big"):
            effort_by_id[tid] = eff
    return greeting, effort_by_id


def build_review(db: Session, user, tasks, context: dict) -> dict:
    """Produce the morning-review payload for one activity-day.

    tasks   — the day's finished Task rows (task_type == task)
    context — {weekday, date, done_count, big_count, small_count, sleep_hours,
               mood, trend}
    Returns {"greeting": str, "tasks": [{"id","title","effort_guess"}]}.
    Never raises — always yields a sunny greeting and a guess per task.
    """
    overrides, few_shot = _load_examples(db, user.id)

    greeting = ""
    haiku_effort = {}
    key = os.getenv("ANTHROPIC_API_KEY")
    if key and tasks:
        try:
            greeting, haiku_effort = _haiku_call(key, tasks, context, few_shot)
        except Exception:
            greeting, haiku_effort = "", {}

    if not greeting:
        greeting = _fallback_greeting(context.get("weekday", ""))

    out_tasks = []
    for t in tasks:
        title_key = (t.title or "").strip().lower()
        # Her own past correction wins; then Haiku; then heuristic.
        guess = (
            overrides.get(title_key)
            or haiku_effort.get(t.id)
            or _heuristic_effort(t.title)
        )
        out_tasks.append({"id": t.id, "title": t.title, "effort_guess": guess})

    return {"greeting": greeting, "tasks": out_tasks}
