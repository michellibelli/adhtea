"""Pure-function tests for domain date enforcement.

`next_allowed_date` is load-bearing for Phase 3.8 — AI-generated task dates,
cascade shifts, and frontend warnings all snap through it.
"""

from datetime import date

from routes.domain_utils import (
    date_allowed,
    next_allowed_date,
    allowed_days_set,
    domain_days_prompt_hint,
)

# Weekday indices (Python date.weekday): Mon=0, Tue=1, ... Sun=6
WEEKDAYS = [0, 1, 2, 3, 4]
WEEKENDS = [5, 6]
MON = date(2026, 5, 18)        # Monday
SAT = date(2026, 5, 16)        # Saturday
SUN = date(2026, 5, 17)        # Sunday


# ---------------------------------------------------------------------------
# next_allowed_date
# ---------------------------------------------------------------------------

def test_empty_rules_returns_input_date():
    assert next_allowed_date(SAT, []) == SAT


def test_weekday_rule_snaps_saturday_to_monday():
    rules = [{"days": WEEKDAYS}]
    assert next_allowed_date(SAT, rules) == MON


def test_weekday_rule_snaps_sunday_to_monday():
    rules = [{"days": WEEKDAYS}]
    assert next_allowed_date(SUN, rules) == MON


def test_weekday_rule_keeps_allowed_day():
    rules = [{"days": WEEKDAYS}]
    assert next_allowed_date(MON, rules) == MON


def test_multi_rule_or_logic():
    # rule A: weekdays, rule B: weekends → all days allowed
    rules = [{"days": WEEKDAYS}, {"days": WEEKENDS}]
    assert next_allowed_date(SAT, rules) == SAT
    assert next_allowed_date(MON, rules) == MON


def test_unrestricted_rule_permits_any_day():
    # rule with days=None means "no day restriction"
    rules = [{"days": None}]
    assert next_allowed_date(SAT, rules) == SAT


# ---------------------------------------------------------------------------
# date_allowed
# ---------------------------------------------------------------------------

def testdate_allowed_empty_rules_accepts():
    assert date_allowed(SAT, []) is True


def testdate_allowed_rejects_when_no_rule_matches():
    rules = [{"days": WEEKDAYS}]
    assert date_allowed(SAT, rules) is False
    assert date_allowed(MON, rules) is True


# ---------------------------------------------------------------------------
# allowed_days_set
# ---------------------------------------------------------------------------

def test_allowed_days_set_empty_rules_full_week():
    assert allowed_days_set([]) == set(range(7))


def test_allowed_days_set_unrestricted_rule_full_week():
    assert allowed_days_set([{"days": None}]) == set(range(7))


def test_allowed_days_set_unions_rules():
    assert allowed_days_set([{"days": [0, 1]}, {"days": [4, 5]}]) == {0, 1, 4, 5}


# ---------------------------------------------------------------------------
# domain_days_prompt_hint
# ---------------------------------------------------------------------------

def test_prompt_hint_empty_when_all_days_allowed():
    assert domain_days_prompt_hint([]) == ""
    assert domain_days_prompt_hint([{"days": None}]) == ""


def test_prompt_hint_lists_named_days_in_order():
    hint = domain_days_prompt_hint([{"days": WEEKDAYS}])
    assert "Monday" in hint
    assert "Friday" in hint
    assert "Saturday" not in hint
    # Days appear in calendar order, not list order
    assert hint.index("Monday") < hint.index("Friday")
