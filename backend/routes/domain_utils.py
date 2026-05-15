"""Domain date enforcement helpers."""

from datetime import date, timedelta

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _date_allowed(d: date, rules: list) -> bool:
    """True if d matches at least one rule's allowed days. Empty rules = no restriction."""
    if not rules:
        return True
    wd = d.weekday()  # 0=Mon, 6=Sun
    for rule in rules:
        days = rule.get("days")
        if days is not None and wd not in days:
            continue
        return True
    return False


def next_allowed_date(d: date, rules: list, max_days: int = 365) -> date:
    """Snap d forward to the nearest day allowed by domain rules."""
    if not rules:
        return d
    for i in range(max_days):
        candidate = d + timedelta(days=i)
        if _date_allowed(candidate, rules):
            return candidate
    return d  # fallback — should never happen with reasonable rules


def allowed_days_set(rules: list) -> set[int]:
    """Return set of weekday ints (0=Mon) allowed by any rule. Empty = all days."""
    if not rules:
        return set(range(7))
    days = set()
    for rule in rules:
        rule_days = rule.get("days")
        if rule_days is None:
            return set(range(7))  # at least one rule has no day restriction
        days.update(rule_days)
    return days


def domain_days_prompt_hint(rules: list) -> str:
    """Short string for injecting allowed days into an AI prompt."""
    days = allowed_days_set(rules)
    if not days or days == set(range(7)):
        return ""
    names = ", ".join(DAY_NAMES[d] for d in sorted(days))
    return (
        f"\n- Domain constraint: schedule tasks ONLY on these days: {names}. "
        "Choose day_offset values that land on allowed days."
    )
