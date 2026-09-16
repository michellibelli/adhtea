"""PID controller behind the weekly self-care data pipeline.

Pure functions — no database, FastAPI, or project imports.
Takes current week averages + prior snapshot → computes P/I/D per variable,
stored on WeeklySnapshot.pid_state for the future productivity-vs-self-care
analysis this is being built toward (see PROJECT.md). Half-built by design —
no user-facing surface reads pid_state yet.

Used to also drive nudge messaging: first a daily popup (/insights/nudge,
removed 4.20.0), then a "weekly insight" line surfaced on Focus and the
self-care gate (removed 2026-09-16) — per explicit request, any phrasing
that prompts her toward sleep/meals/exercise/check-in reads as the same
nagging regardless of which surface it's wearing. compute_pid_state stays;
nothing renders its output to her.
"""

Kp = 0.5
Ki = 0.3
Kd = 0.2

ANTI_WINDUP_DECAY = 0.7
INTEGRAL_CAP = 3.0

TARGETS = {
    "sleep":    {"target": 7.5, "max_error": 7.5},
    "meals":    {"target": 3.0, "max_error": 3.0},
    "exercise": {"target": 4.0, "max_error": 4.0},
    "checkin":  {"target": 0.9, "max_error": 0.9},
}


def compute_pid_state(
    current_averages: dict,
    prior_pid_state: dict | None,
) -> dict:
    prior = prior_pid_state or {}
    result = {}

    for var, cfg in TARGETS.items():
        current = current_averages.get(var) or 0
        target = cfg["target"]
        max_err = cfg["max_error"]

        error = max(0, target - current)
        p = min(error / max_err, 1.0)

        prev = prior.get(var, {})
        prior_integral = prev.get("i", 0.0)
        prior_value = prev.get("prior_value", current)

        weekly_error = error / max_err
        improving = current > prior_value
        if improving:
            integral = (prior_integral + weekly_error) * ANTI_WINDUP_DECAY
        else:
            integral = prior_integral + weekly_error
        integral = min(integral, INTEGRAL_CAP)

        delta = prior_value - current
        d = delta / max_err

        score = Kp * p + Ki * integral + Kd * d

        result[var] = {
            "p": round(p, 4),
            "i": round(integral, 4),
            "d": round(d, 4),
            "score": round(score, 4),
            "prior_value": round(current, 2),
        }

    return result


