"""SQLite storage for the Helios Solar demo. Schema plus a connection helper."""

from __future__ import annotations

import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS customers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    phone      TEXT NOT NULL,
    city       TEXT NOT NULL,
    plan       TEXT NOT NULL CHECK (plan IN ('none','residential-5kw','residential-8kw','commercial')),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    company    TEXT NOT NULL DEFAULT '',
    interest   TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_visits (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_email TEXT NOT NULL,
    start_iso     TEXT NOT NULL,
    end_iso       TEXT NOT NULL,
    title         TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

-- ponytail: one crew, so a single global booking calendar. Add a crew_id column and
-- widen this index if Helios ever gets a second van.
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_visits_start ON site_visits (start_iso);
"""


def db_path() -> Path:
    """Resolve the database file. Read at call time so tests can set the env var."""
    return Path(os.getenv("SONAR_DB_PATH", "./sonar.db"))


@contextmanager
def session() -> Iterator[sqlite3.Connection]:
    """Open the database (creating the schema if new), commit on success, always close.

    `with sqlite3.connect(...)` commits but does not close, which leaks a handle per
    call. Everything goes through here so that is fixed in one place.
    """
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()
