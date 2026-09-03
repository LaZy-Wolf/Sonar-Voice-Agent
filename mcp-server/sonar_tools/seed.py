"""Deterministic demo data. Idempotent — safe to run repeatedly.

    python -m sonar_tools.seed
"""

from __future__ import annotations

import random
import re
from datetime import timedelta

from faker import Faker

from .db import db_path, session
from .tools import _now

CITIES = ("Hyderabad", "Warangal", "Vijayawada", "Bengaluru")
PLANS = ("none", "none", "residential-5kw", "residential-8kw", "commercial")
N_CUSTOMERS = 60
N_VISITS = 5


def _email(name: str, taken: set[str]) -> str:
    """firstname.lastname@example.com, suffixed on collision so it stays unique."""
    slug = re.sub(r"[^a-z]+", ".", name.lower()).strip(".")
    email = f"{slug}@example.com"
    n = 2
    while email in taken:
        email = f"{slug}{n}@example.com"
        n += 1
    taken.add(email)
    return email


def seed() -> dict:
    fake = Faker("en_IN")
    Faker.seed(42)
    rng = random.Random(42)

    now = _now()
    created = now.isoformat(timespec="seconds")
    taken: set[str] = set()

    customers = []
    for _ in range(N_CUSTOMERS):
        name = fake.name()
        customers.append(
            (
                name,
                _email(name, taken),
                f"+91{rng.randint(70, 99)}{rng.randint(10**7, 10**8 - 1)}",
                rng.choice(CITIES),
                rng.choice(PLANS),
                created,
            )
        )

    # Five visits over the coming week, on weekdays, on the hour, no two alike.
    visits, slots = [], set()
    while len(visits) < N_VISITS:
        day = now + timedelta(days=rng.randint(1, 7))
        if day.weekday() >= 5:
            continue
        start = day.replace(hour=rng.randint(9, 15), minute=0, second=0, microsecond=0)
        key = start.isoformat(timespec="seconds")
        if key in slots:
            continue
        slots.add(key)
        end = start + timedelta(minutes=60)
        visits.append(
            (
                customers[len(visits)][1],
                key,
                end.isoformat(timespec="seconds"),
                "Solar site assessment",
                created,
            )
        )

    with session() as conn:
        conn.executemany(
            """INSERT OR IGNORE INTO customers (name, email, phone, city, plan, created_at)
               VALUES (?,?,?,?,?,?)""",
            customers,
        )
        conn.executemany(
            """INSERT OR IGNORE INTO site_visits
               (customer_email, start_iso, end_iso, title, created_at) VALUES (?,?,?,?,?)""",
            visits,
        )
        counts = {
            t: conn.execute(f"SELECT COUNT(*) c FROM {t}").fetchone()["c"]
            for t in ("customers", "leads", "site_visits")
        }
    return counts


if __name__ == "__main__":
    print(f"seeded {db_path().resolve()}: {seed()}")
