"""Pure-function tests for domain date enforcement.

`next_allowed_date` is load-bearing for Phase 3.8 — AI-generated task dates,
cascade shifts, and frontend warnings all snap through it.
"""

from datetime import date, datetime

from routes.domain_utils import (
    date_allowed,
    next_allowed_date,
    allowed_days_set,
    domain_days_prompt_hint,
    current_time_bucket,
    time_of_day_allowed,
    TOD_MORNING,
    TOD_AFTERNOON,
    TOD_EVENING,
    TOD_NIGHT,
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


# ---------------------------------------------------------------------------
# current_time_bucket
# ---------------------------------------------------------------------------

def test_bucket_morning_lower_bound():
    assert current_time_bucket(datetime(2026, 5, 18, 6, 0)) == TOD_MORNING


def test_bucket_morning_upper_bound():
    assert current_time_bucket(datetime(2026, 5, 18, 11, 59)) == TOD_MORNING


def test_bucket_afternoon():
    assert current_time_bucket(datetime(2026, 5, 18, 12, 0)) == TOD_AFTERNOON
    assert current_time_bucket(datetime(2026, 5, 18, 16, 59)) == TOD_AFTERNOON


def test_bucket_evening():
    assert current_time_bucket(datetime(2026, 5, 18, 17, 0)) == TOD_EVENING
    assert current_time_bucket(datetime(2026, 5, 18, 21, 59)) == TOD_EVENING


def test_bucket_night_wraps_midnight():
    assert current_time_bucket(datetime(2026, 5, 18, 22, 0)) == TOD_NIGHT
    assert current_time_bucket(datetime(2026, 5, 18, 23, 59)) == TOD_NIGHT
    assert current_time_bucket(datetime(2026, 5, 19, 0, 0)) == TOD_NIGHT
    assert current_time_bucket(datetime(2026, 5, 19, 5, 59)) == TOD_NIGHT


# ---------------------------------------------------------------------------
# time_of_day_allowed
# ---------------------------------------------------------------------------

def test_time_of_day_empty_rules_always_allowed():
    assert time_of_day_allowed(datetime(2026, 5, 18, 9, 0), []) is True


def test_time_of_day_no_times_field_allowed_on_matching_day():
    # Home weekend rule has no times restriction → any hour on Sat/Sun is fine
    rules = [{"days": [5, 6]}]
    assert time_of_day_allowed(datetime(2026, 5, 16, 10, 0), rules) is True  # Sat


def test_time_of_day_no_times_field_blocked_on_wrong_day():
    rules = [{"days": [5, 6]}]
    assert time_of_day_allowed(datetime(2026, 5, 18, 10, 0), rules) is False  # Mon


def test_time_of_day_evening_only_blocks_workday():
    # Mirrors the live Home default first rule
    rules = [{"days": [0, 1, 2, 3, 4], "times": ["evening"]}]
    monday_10am   = datetime(2026, 5, 18, 10, 0)
    monday_8pm    = datetime(2026, 5, 18, 20, 0)
    assert time_of_day_allowed(monday_10am, rules) is False
    assert time_of_day_allowed(monday_8pm, rules) is True


def test_time_of_day_multi_rule_or_logic():
    # Home: weekday evenings + anytime weekends
    rules = [
        {"days": [0, 1, 2, 3, 4], "times": ["evening"]},
        {"days": [5, 6]},
    ]
    monday_10am   = datetime(2026, 5, 18, 10, 0)
    saturday_10am = datetime(2026, 5, 16, 10, 0)
    monday_8pm    = datetime(2026, 5, 18, 20, 0)
    assert time_of_day_allowed(monday_10am,   rules) is False
    assert time_of_day_allowed(saturday_10am, rules) is True
    assert time_of_day_allowed(monday_8pm,    rules) is True
