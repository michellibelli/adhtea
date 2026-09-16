"""Easy/hard task classification for tea-box interleave placement.

One cheap Haiku call at task creation (routes/tasks.py create_task, task_type
== task only — routines/notes never classified). Explicitly separate from
the removed effort/billing classifier (see review_engine.py) — this is about
where a task lands in the box's First/Morning/Mid Day/Afternoon interleave
(frontend/src/utils/ordering.js), not about time or money.

If Haiku is slow or the key is missing, falls back to 'easy' so task
creation is never blocked by the AI call.
"""

import os

HAIKU_MODEL = "claude-haiku-4-5-20251001"


def _haiku_difficulty(key: str, title: str) -> str:
    """Raises on any failure so the caller can fall back."""
    import anthropic

    client = anthropic.Anthropic(api_key=key)
    system = (
        "Classify a to-do task as easy or hard for someone with ADHD to start. "
        "Easy: quick, low-friction, low-decision-load (a phone call, a quick "
        "errand, a short form). Hard: effortful, multi-step, or dreaded (deep "
        "work, a difficult conversation, anything with real activation energy). "
        "Reply with exactly one word: easy or hard."
    )
    msg = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=5,
        system=system,
        messages=[{"role": "user", "content": title}],
    )
    text = msg.content[0].text.strip().lower()
    return "hard" if "hard" in text else "easy"


def classify_difficulty(title: str) -> str:
    """Never raises — always returns 'easy' or 'hard'."""
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        return "easy"
    try:
        return _haiku_difficulty(key, title)
    except Exception:
        return "easy"
