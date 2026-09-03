"""Helios Solar front-desk tools.

Plain functions, no MCP imports — `server.py` wraps these, and they stay importable
on their own for tests. Every docstring here is shown to the language model as the
tool description, so they are written for that reader.

None of these raise for user error. Bad input comes back as {"ok": False, "reason": ...}
so the agent can recover in conversation instead of dropping the call.
"""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from .db import session

IST = ZoneInfo("Asia/Kolkata")
WORKDAY_START, WORKDAY_END = 9, 17  # 09:00–17:00 IST
INTERESTS = ("residential", "commercial", "battery", "unsure")

# ponytail: good enough to catch a mis-heard email over a phone line, which is the
# only thing it needs to catch. Swap for `email-validator` if these ever get mailed.
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_faq: list[dict] | None = None
_bm25 = None


def _now() -> datetime:
    return datetime.now(IST)


def _load_faq():
    """Load the FAQ and build the BM25 index once, on first search."""
    global _faq, _bm25
    if _bm25 is None:
        from rank_bm25 import BM25Okapi

        _faq = json.loads((Path(__file__).parent / "kb" / "faq.json").read_text("utf-8"))
        _bm25 = BM25Okapi([_tokens(e["q"] + " " + e["a"]) for e in _faq])
    return _faq, _bm25


def _tokens(text: str) -> list[str]:
    # ponytail: strip a trailing "s" rather than stemming properly, so "panels" matches
    # "panel". Applied to the index and the query alike, so even a wrong stem still
    # matches itself. Reach for a real stemmer only if FAQ recall becomes a problem.
    return [
        w[:-1] if len(w) > 3 and w.endswith("s") else w
        for w in re.findall(r"[a-z0-9]+", text.lower())
    ]


def _parse_ist(value: str) -> datetime | None:
    """Parse an ISO 8601 string, assuming IST when it carries no timezone."""
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    return dt.replace(tzinfo=IST) if dt.tzinfo is None else dt.astimezone(IST)


# ─────────────────────────────────────────────────────────────────────────────


def get_current_datetime(timezone: str = "Asia/Kolkata") -> dict:
    """Return the current date, time and weekday in the given IANA timezone.

    Call this before interpreting any relative date such as "today", "tomorrow",
    "this Friday" or "next week". Never guess the current date.
    """
    try:
        # ZoneInfoNotFoundError subclasses KeyError; a malformed key raises ValueError.
        now = datetime.now(ZoneInfo(timezone))
    except (KeyError, ValueError):
        return {"ok": False, "reason": f"Unknown timezone {timezone!r}. Try 'Asia/Kolkata'."}
    return {
        "ok": True,
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M"),
        "weekday": now.strftime("%A"),
        "timezone": timezone,
        "iso": now.isoformat(timespec="seconds"),
    }


def lookup_customer(query: str) -> dict:
    """Find an existing Helios Solar customer by email, phone number, or part of their name.

    Use this before booking a site visit, since only existing customers can be booked.
    Returns {"found": bool, "customers": [...]} with at most 5 matches.
    """
    query = (query or "").strip()
    if len(query) < 2:
        return {"ok": False, "reason": "Give at least two characters to search for."}

    like = f"%{query}%"
    digits = re.sub(r"\D", "", query)
    phone_like = f"%{digits}%" if len(digits) >= 4 else "\x00"  # no-match sentinel

    with session() as conn:
        rows = conn.execute(
            """SELECT name, email, phone, city, plan FROM customers
               WHERE email LIKE ? OR name LIKE ? OR REPLACE(REPLACE(phone,' ',''),'-','') LIKE ?
               ORDER BY name LIMIT 5""",
            (like, like, phone_like),
        ).fetchall()

    customers = [dict(r) for r in rows]
    return {"ok": True, "found": bool(customers), "customers": customers}


def create_lead(name: str, email: str, interest: str, company: str = "") -> dict:
    """Record a new sales lead for someone who is not yet a customer.

    `interest` must be exactly one of: residential, commercial, battery, unsure.
    Confirm the spelling of the email with the caller before calling this.
    """
    name, email = (name or "").strip(), (email or "").strip().lower()
    interest = (interest or "").strip().lower()

    if not name:
        return {"ok": False, "reason": "A name is required."}
    if not _EMAIL.match(email):
        return {"ok": False, "reason": f"{email!r} is not a valid email address."}
    if interest not in INTERESTS:
        return {"ok": False, "reason": f"interest must be one of: {', '.join(INTERESTS)}."}

    created = _now().isoformat(timespec="seconds")
    with session() as conn:
        lead_id = conn.execute(
            "INSERT INTO leads (name, email, company, interest, created_at) VALUES (?,?,?,?,?)",
            (name, email, (company or "").strip(), interest, created),
        ).lastrowid
    return {
        "ok": True,
        "lead": {
            "id": lead_id,
            "name": name,
            "email": email,
            "company": company,
            "interest": interest,
            "created_at": created,
        },
    }


def check_availability(date: str, duration_minutes: int = 60) -> dict:
    """List free site-visit slots on a date given as YYYY-MM-DD.

    Slots start on the hour between 09:00 and 17:00 IST and exclude anything already
    booked. Returns ISO 8601 start times. Resolve relative dates with
    get_current_datetime first.
    """
    try:
        day = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=IST)
    except ValueError:
        return {"ok": False, "reason": f"Date must look like YYYY-MM-DD, got {date!r}."}
    if not 15 <= duration_minutes <= 240:
        return {"ok": False, "reason": "duration_minutes must be between 15 and 240."}

    span = timedelta(minutes=duration_minutes)
    with session() as conn:
        booked = [
            (_parse_ist(r["start_iso"]), _parse_ist(r["end_iso"]))
            for r in conn.execute(
                "SELECT start_iso, end_iso FROM site_visits WHERE start_iso LIKE ?",
                (f"{date}%",),
            )
        ]

    free = []
    for hour in range(WORKDAY_START, WORKDAY_END):
        start = day.replace(hour=hour)
        if start + span > day.replace(hour=WORKDAY_END):
            break
        if any(start < b_end and b_start < start + span for b_start, b_end in booked):
            continue
        free.append(start.isoformat(timespec="seconds"))

    return {"ok": True, "date": date, "duration_minutes": duration_minutes, "slots": free}


def book_site_visit(
    customer_email: str,
    start_iso: str,
    duration_minutes: int = 60,
    title: str = "Solar site assessment",
) -> dict:
    """Book a site visit for an existing customer at an ISO 8601 start time in IST.

    The customer must already exist — look them up first, and create a lead instead if
    they do not. Check availability first; a clashing slot is refused.
    """
    email = (customer_email or "").strip().lower()
    start = _parse_ist(start_iso)
    if start is None:
        return {"ok": False, "reason": f"Could not read {start_iso!r} as an ISO 8601 time."}
    if not 15 <= duration_minutes <= 240:
        return {"ok": False, "reason": "duration_minutes must be between 15 and 240."}

    end = start + timedelta(minutes=duration_minutes)
    if not (WORKDAY_START <= start.hour and end.hour <= WORKDAY_END):
        return {
            "ok": False,
            "reason": f"Site visits run between {WORKDAY_START:02d}:00 and {WORKDAY_END:02d}:00 IST.",
        }

    with session() as conn:
        if not conn.execute("SELECT 1 FROM customers WHERE email = ?", (email,)).fetchone():
            return {"ok": False, "reason": f"No customer found with email {email}."}

        clash = conn.execute(
            "SELECT start_iso FROM site_visits WHERE start_iso < ? AND end_iso > ?",
            (end.isoformat(timespec="seconds"), start.isoformat(timespec="seconds")),
        ).fetchone()
        if clash:
            return {"ok": False, "reason": f"That slot clashes with a visit at {clash['start_iso']}."}

        try:
            visit_id = conn.execute(
                """INSERT INTO site_visits (customer_email, start_iso, end_iso, title, created_at)
                   VALUES (?,?,?,?,?)""",
                (
                    email,
                    start.isoformat(timespec="seconds"),
                    end.isoformat(timespec="seconds"),
                    title,
                    _now().isoformat(timespec="seconds"),
                ),
            ).lastrowid
        except sqlite3.IntegrityError:
            return {"ok": False, "reason": "That slot was just taken."}

    return {
        "ok": True,
        "booking": {
            "id": visit_id,
            "customer_email": email,
            "start_iso": start.isoformat(timespec="seconds"),
            "end_iso": end.isoformat(timespec="seconds"),
            "title": title,
        },
    }


def search_knowledge_base(question: str, top_k: int = 3) -> dict:
    """Search Helios Solar's FAQ for facts about pricing, subsidies, warranties,
    installation timelines, net metering, maintenance, financing and service areas.

    Always call this before stating any price, subsidy, warranty period or timeline.
    Never answer such questions from memory. Returns the top matches with scores.
    """
    question = (question or "").strip()
    if not question:
        return {"ok": False, "reason": "Ask a question to search for."}
    top_k = max(1, min(int(top_k), 10))

    faq, bm25 = _load_faq()
    scores = bm25.get_scores(_tokens(question))
    ranked = sorted(range(len(faq)), key=lambda i: scores[i], reverse=True)[:top_k]
    results = [
        {"q": faq[i]["q"], "a": faq[i]["a"], "score": round(float(scores[i]), 3)}
        for i in ranked
        if scores[i] > 0
    ]
    return {"ok": True, "question": question, "results": results}


ALL_TOOLS = (
    get_current_datetime,
    lookup_customer,
    create_lead,
    check_availability,
    book_site_visit,
    search_knowledge_base,
)
