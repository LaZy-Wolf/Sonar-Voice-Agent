"""Tool behaviour against a throwaway database."""

from __future__ import annotations

from datetime import timedelta

import pytest

from sonar_tools import tools
from sonar_tools.seed import seed


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """Point every tool at a fresh seeded database for each test."""
    monkeypatch.setenv("SONAR_DB_PATH", str(tmp_path / "test.db"))
    return seed()


@pytest.fixture
def a_customer():
    return tools.lookup_customer("example.com")["customers"][0]


def tomorrow() -> str:
    return (tools._now() + timedelta(days=1)).strftime("%Y-%m-%d")


# ── seed ────────────────────────────────────────────────────────────────────


def test_seed_is_idempotent(temp_db):
    assert temp_db["customers"] == 60
    assert temp_db["site_visits"] == 5
    assert seed()["customers"] == 60, "re-seeding must not duplicate rows"


# ── lookup_customer ─────────────────────────────────────────────────────────


def test_lookup_by_email(a_customer):
    found = tools.lookup_customer(a_customer["email"])
    assert found["found"]
    assert found["customers"][0]["email"] == a_customer["email"]


def test_lookup_by_partial_name(a_customer):
    surname = a_customer["name"].split()[-1]
    assert tools.lookup_customer(surname)["found"]


def test_lookup_by_phone(a_customer):
    assert tools.lookup_customer(a_customer["phone"])["found"]


def test_lookup_by_phone_ignores_formatting(a_customer):
    spaced = a_customer["phone"][:5] + " " + a_customer["phone"][5:]
    assert tools.lookup_customer(spaced)["found"]


def test_lookup_unknown_returns_empty_not_error():
    result = tools.lookup_customer("nobody-by-this-name")
    assert result["ok"] and not result["found"] and result["customers"] == []


def test_lookup_rejects_single_character():
    assert tools.lookup_customer("a")["ok"] is False


def test_lookup_caps_at_five():
    assert len(tools.lookup_customer("example.com")["customers"]) == 5


# ── create_lead ─────────────────────────────────────────────────────────────


def test_create_lead():
    lead = tools.create_lead("Anita Rao", "anita@example.com", "residential")
    assert lead["ok"] and lead["lead"]["id"] > 0
    assert lead["lead"]["interest"] == "residential"


def test_create_lead_rejects_bad_interest():
    result = tools.create_lead("Anita Rao", "anita@example.com", "spaceship")
    assert result["ok"] is False and "residential" in result["reason"]


def test_create_lead_rejects_bad_email():
    assert tools.create_lead("Anita Rao", "anita-at-example", "residential")["ok"] is False


def test_create_lead_requires_name():
    assert tools.create_lead("", "anita@example.com", "residential")["ok"] is False


def test_create_lead_normalises_case():
    lead = tools.create_lead("Anita Rao", "  Anita@Example.COM ", "  Residential ")
    assert lead["ok"] and lead["lead"]["email"] == "anita@example.com"


# ── check_availability ──────────────────────────────────────────────────────


def test_availability_returns_hourly_slots():
    slots = tools.check_availability(tomorrow())
    assert slots["ok"]
    assert all(s.endswith(":00:00+05:30") for s in slots["slots"])


def test_availability_excludes_booked_slot(a_customer):
    day = tomorrow()
    taken = tools.check_availability(day)["slots"][0]
    assert tools.book_site_visit(a_customer["email"], taken)["ok"]
    assert taken not in tools.check_availability(day)["slots"]


def test_availability_rejects_bad_date():
    assert tools.check_availability("tomorrow")["ok"] is False


def test_availability_long_duration_yields_fewer_slots():
    day = tomorrow()
    assert len(tools.check_availability(day, 240)["slots"]) < len(
        tools.check_availability(day, 60)["slots"]
    )


# ── book_site_visit ─────────────────────────────────────────────────────────


def test_booking_an_unknown_customer_fails():
    result = tools.book_site_visit("ghost@example.com", f"{tomorrow()}T10:00:00")
    assert result["ok"] is False and "No customer" in result["reason"]


def test_double_booking_is_refused(a_customer):
    when = f"{tomorrow()}T10:00:00"
    assert tools.book_site_visit(a_customer["email"], when)["ok"]
    clash = tools.book_site_visit(a_customer["email"], when)
    assert clash["ok"] is False and "clash" in clash["reason"]


def test_overlapping_booking_is_refused(a_customer):
    """A 10:00 visit must block an 11:00 one when the first runs two hours."""
    assert tools.book_site_visit(a_customer["email"], f"{tomorrow()}T10:00:00", 120)["ok"]
    clash = tools.book_site_visit(a_customer["email"], f"{tomorrow()}T11:00:00")
    assert clash["ok"] is False


def test_booking_outside_working_hours_is_refused(a_customer):
    assert tools.book_site_visit(a_customer["email"], f"{tomorrow()}T21:00:00")["ok"] is False


def test_booking_rejects_unparseable_time(a_customer):
    assert tools.book_site_visit(a_customer["email"], "next tuesday-ish")["ok"] is False


# ── search_knowledge_base ───────────────────────────────────────────────────


def test_kb_finds_panel_warranty():
    results = tools.search_knowledge_base("how long is the panel warranty")["results"]
    assert "25 year" in results[0]["a"]


def test_kb_finds_subsidy():
    joined = " ".join(r["a"] for r in tools.search_knowledge_base("government subsidy")["results"])
    assert "subsidy" in joined.lower()


def test_kb_respects_top_k():
    assert len(tools.search_knowledge_base("solar", top_k=2)["results"]) <= 2


def test_kb_rejects_empty_question():
    assert tools.search_knowledge_base("")["ok"] is False


# ── get_current_datetime ────────────────────────────────────────────────────


def test_current_datetime_defaults_to_ist():
    now = tools.get_current_datetime()
    assert now["ok"] and now["timezone"] == "Asia/Kolkata"
    assert now["iso"].endswith("+05:30")


def test_current_datetime_rejects_bad_timezone():
    assert tools.get_current_datetime("Mars/Olympus")["ok"] is False
