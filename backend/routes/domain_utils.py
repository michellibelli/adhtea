"""Domain date enforcement helpers.

A "domain" is a life area (e.g. Work, Family) that can have scheduling rules
like "only allow tasks on weekdays" or "only mornings." These helpers check
and enforce those rules when placing tasks on the calendar.
"""

from datetime import date, timedelta

# Full weekday names indexed 0=Monday … 6=Sunday (matches Python's date.weekday())
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def date_allowed(d: date, rules: list) -> bool:
    """Return True if date d is permitted by at least one rule in the list.

    Rules use OR logic — if ANY rule permits the day, the date is allowed.
    A rule with days=None has no day restriction (any day is fine).
    Empty rules list means no restrictions at all.
    """
    if not rules:
        return True
    wd = d.weekday()  # 0=Mon, 6=Sun
    for rule in rules:
        days = rule.get("days")
        # If this rule restricts days and today isn't one of them, try the next rule
        if days is not None and wd not in days:
            continue
        # Either no day restriction or the day matched — this rule permits the date
        return True
    return False  # no rule permitted this day


def next_allowed_date(d: date, rules: list, max_days: int = 365) -> date:
    """Walk forward from d until we find a day the domain rules permit.

    Used when AI generates tasks with due dates — we snap any restricted date
    to the next valid one (e.g. if a Work domain only allows weekdays and the
    AI picked Saturday, this returns the following Monday).
    """
    if not rules:
        return d
    for i in range(max_days):
        candidate = d + timedelta(days=i)
        if date_allowed(candidate, rules):
            return candidate
    return d  # safety fallback — shouldn't happen with reasonable rules


def allowed_days_set(rules: list) -> set[int]:
    """Return the set of weekday numbers (0=Mon … 6=Sun) allowed by any rule.

    If a rule has no day restriction (days=None) that means ALL days are allowed,
    so we immediately return the full set. Empty rules also returns all days.
    """
    if not rules:
        return set(range(7))
    days = set()
    for rule in rules:
        rule_days = rule.get("days")
        if rule_days is None:
            return set(range(7))  # one unrestricted rule = all days are fair game
        days.update(rule_days)
    return days


def domain_days_prompt_hint(rules: list) -> str:
    """Build a short constraint string to inject into the AI task-generation prompt.

    Tells Claude which days of the week tasks for this domain may be scheduled on.
    Returns empty string when there are no day restrictions.
    """
    days = allowed_days_set(rules)
    if not days or days == set(range(7)):
        return ""
    names = ", ".join(DAY_NAMES[d] for d in sorted(days))
    return (
        f"\n- Domain constraint: schedule tasks ONLY on these days: {names}. "
        "Choose day_offset values that land on allowed days."
    )
