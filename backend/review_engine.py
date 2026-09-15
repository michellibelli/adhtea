"""Morning-review greeting.

One cheap Haiku call writes a warm, optimistic, sunny sentence to open her
day. Small/big effort classification lived here too until 4.20.0 — time
captured at completion (Task.minutes_spent / is_work) replaced it, so the
per-task guess-and-correct loop (Haiku classification, the keyword
heuristic, EffortExample) is gone. EffortExample itself stays declared in
models.py as an orphan, same as other removed-feature leftovers in this
codebase — no migration for a table nothing writes to anymore.

If Haiku is slow or the key is missing (Render cold start), falls back to a
rotating sunny line — the review never blocks the morning gate.
"""

import os
import random

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


def _fallback_greeting(weekday: str) -> str:
    return random.choice(_SUNNY_FALLBACKS).format(weekday=weekday or "today")


def _haiku_greeting(key: str, context: dict) -> str:
    """Raises on any failure so the caller can fall back."""
    import anthropic

    client = anthropic.Anthropic(api_key=key)

    system = (
        "You help the user, who has ADHD, start her day.\n"
        "Return ONE warm, optimistic, sunny sentence to open her day, and "
        "nothing else — no preamble, no quotes. Always upbeat and bright — "
        "never neutral, never cautionary, never clinical, no hedging. Light "
        "and encouraging. May nod to the day of week or what she finished "
        "yesterday. End on a sunny note. Max ~20 words."
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

    msg = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=100,
        system=system,
        messages=[{"role": "user", "content": "\n".join(lines)}],
    )
    return msg.content[0].text.strip()


def build_review(db, user, tasks, context: dict) -> dict:
    """Produce the morning-review payload for one activity-day.

    tasks   — the day's finished Task rows (task_type == task)
    context — {weekday, date, done_count, sleep_hours, mood, trend}
    Returns {"greeting": str, "tasks": [{"id","title"}]}.
    Never raises — always yields a sunny greeting.
    """
    greeting = ""
    key = os.getenv("ANTHROPIC_API_KEY")
    if key:
        try:
            greeting = _haiku_greeting(key, context)
        except Exception:
            greeting = ""

    if not greeting:
        greeting = _fallback_greeting(context.get("weekday", ""))

    out_tasks = [{"id": t.id, "title": t.title} for t in tasks]
    return {"greeting": greeting, "tasks": out_tasks}
