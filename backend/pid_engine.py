"""PID controller for behavior-change nudges.

Pure functions — no database, FastAPI, or project imports.
Takes current week averages + prior snapshot → computes P/I/D per variable
→ returns ranked nudge list.
"""

Kp = 0.5
Ki = 0.3
Kd = 0.2

ANTI_WINDUP_DECAY = 0.7
INTEGRAL_CAP = 3.0
SUPPRESS_THRESHOLD = 0.1

TARGETS = {
    "sleep":    {"target": 7.5, "max_error": 7.5},
    "meals":    {"target": 3.0, "max_error": 3.0},
    "exercise": {"target": 4.0, "max_error": 4.0},
    "checkin":  {"target": 0.9, "max_error": 0.9},
}

NUDGE_MESSAGES = {
    "sleep": {
        "question": "Have you thought about winding down for sleep tonight? Even 15 minutes earlier helps \U0001f49b",
        "positive": "Nice — sleep is trending up \U0001f49b",
    },
    "meals": {
        "question": "Have you eaten? Even a snack counts \U0001f49b",
        "positive": "Nourished and steady — keep it up \U0001f49b",
    },
    "exercise": {
        "question": "Could you take a short walk today? Even 10 minutes counts \U0001f49b",
        "positive": "Great job getting some exercise! Keep going \U0001f49b",
    },
    "checkin": {
        "question": "Morning check-in helps me help you — one minute? \U0001f49b",
        "positive": "Check-in consistency is building \U0001f49b",
    },
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


def _progress_tag(var: str, averages: dict | None) -> str:
    if not averages:
        return ""
    if var == "sleep":
        val = averages.get("sleep", 0)
        return f" (avg {round(val, 1)}h — target {TARGETS['sleep']['target']}h)"
    if var == "meals":
        val = averages.get("meals", 0)
        return f" (avg {round(val, 1)}/day — target {int(TARGETS['meals']['target'])})"
    if var == "exercise":
        val = int(averages.get("exercise", 0))
        target = int(TARGETS["exercise"]["target"])
        return f" ({val} of {target} days this week)"
    if var == "checkin":
        val = int(averages.get("checkin_days", 0))
        total = int(averages.get("weekdays", 5))
        return f" ({val} of {total} weekdays)"
    return ""


def satisfied_today(today_log: dict | None) -> set[str]:
    """Variables the user has already logged today.

    Micro-nudges ask about *today* ("Have you eaten?"), but they are scored on
    the week's rolling averages, where one good day barely dents a deficit. So a
    variable she has already noted in today's self-care log has to be dropped
    from the ranking outright, or the app nudges her to do a thing she just told
    it she did. Any entry counts — the questions are yes/no, and the pull toward
    the actual target lives in the weekly insight, not in the micro-nudge.
    """
    if not today_log:
        return set()

    done = {"checkin"}  # a log row exists at all — that *is* the check-in

    meals = today_log.get("meals")
    if meals is not None and meals >= 1:
        done.add("meals")

    if today_log.get("exercise"):
        done.add("exercise")

    if today_log.get("sleep_hours") is not None:
        done.add("sleep")

    return done


def rank_nudges(
    pid_state: dict,
    current_averages: dict | None = None,
    exclude: set | None = None,
) -> list[dict]:
    skip = exclude or set()
    ranked = []
    for var, state in pid_state.items():
        if var in skip:
            continue

        score = state["score"]
        improving = state["d"] < 0

        if score <= 0:
            continue
        if improving and score < SUPPRESS_THRESHOLD:
            continue

        msgs = NUDGE_MESSAGES.get(var, {})
        if improving:
            message = msgs.get("positive", "")
        else:
            message = msgs.get("question", "")

        message += _progress_tag(var, current_averages)

        ranked.append({
            "variable": var,
            "score": score,
            "improving": improving,
            "message": message,
        })

    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked


def generate_weekly_insight(pid_state: dict, averages: dict) -> str:
    ranked = rank_nudges(pid_state)
    if not ranked:
        return "Steady week — keep going at your own pace \U0001f49b"

    top = ranked[0]
    var = top["variable"]
    improving = top["improving"]

    val = averages.get(var, "?")
    if isinstance(val, float):
        val = round(val, 1)

    total = averages.get("weekdays_in_period", 5)

    if improving:
        templates = {
            "sleep": f"Sleep is up to {val}h — your rhythm is finding its groove \U0001f49b",
            "meals": f"Meals averaging {val}/day — nourished and steady \U0001f49b",
            "exercise": f"You moved {val} days — momentum building \U0001f49b",
            "checkin": "Check-ins becoming a habit — consistency is kindness to yourself \U0001f49b",
        }
    else:
        templates = {
            "sleep": f"Sleep dipped to {val}h — even 15 minutes earlier tonight? \U0001f49b",
            "meals": f"Meals at {val}/day — even a snack counts \U0001f49b",
            "exercise": f"Movement dropped to {val} days — a short walk tomorrow? \U0001f49b",
            "checkin": f"Check-ins slipped to {val}/{total} weekdays — one minute tomorrow morning? \U0001f49b",
        }

    return templates.get(var, "Keep listening to what you need \U0001f49b")
