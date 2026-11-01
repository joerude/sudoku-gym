"""SQLite schema and connection for Sudoku Gym."""

import os
import sqlite3
from datetime import UTC, datetime

DEFAULT_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "sudoku.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS puzzles (
    id INTEGER PRIMARY KEY,
    bank_id TEXT UNIQUE NOT NULL,
    level TEXT NOT NULL,
    givens TEXT NOT NULL,
    solution TEXT NOT NULL,
    se_rating REAL,
    tech_grade INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS puzzles_level ON puzzles(level);

CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY,
    puzzle_id INTEGER NOT NULL REFERENCES puzzles(id),
    mode TEXT NOT NULL CHECK (mode IN ('original', 'hardcore')),
    mistake_limit INTEGER,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'solved', 'failed', 'abandoned')),
    time_ms INTEGER,
    mistakes INTEGER,
    corrections INTEGER,
    checks INTEGER,
    note_actions INTEGER,
    first_move_ms INTEGER,
    max_pause_ms INTEGER,
    long_pauses INTEGER,
    daily TEXT  -- local date of the daily puzzle this game was started as; NULL for other games
);
CREATE INDEX IF NOT EXISTS games_puzzle ON games(puzzle_id);

CREATE TABLE IF NOT EXISTS moves (
    game_id INTEGER NOT NULL REFERENCES games(id),
    seq INTEGER NOT NULL,
    t_ms INTEGER NOT NULL,
    cell INTEGER,
    value INTEGER,
    kind TEXT NOT NULL CHECK (kind IN ('place', 'erase', 'note', 'check', 'undo')),
    correct INTEGER,
    PRIMARY KEY (game_id, seq)
);

CREATE TABLE IF NOT EXISTS techniques (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    level INTEGER NOT NULL,
    ord INTEGER NOT NULL,
    drill TEXT,
    body_md TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drills (
    id INTEGER PRIMARY KEY,
    technique TEXT NOT NULL,
    puzzle_id INTEGER NOT NULL REFERENCES puzzles(id),
    board TEXT NOT NULL,
    answers TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'place'
);
CREATE INDEX IF NOT EXISTS drills_technique ON drills(technique);

CREATE TABLE IF NOT EXISTS drill_attempts (
    id INTEGER PRIMARY KEY,
    drill_id INTEGER NOT NULL REFERENCES drills(id),
    at TEXT NOT NULL,
    time_ms INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    cell INTEGER,
    value INTEGER,
    valid_other INTEGER NOT NULL DEFAULT 0,  -- a true move/elimination, but not by the drill's technique
    hint INTEGER NOT NULL DEFAULT 0,  -- 0 none, 1 answered after «где искать», 2 answer revealed (cell/value NULL)
    rated INTEGER NOT NULL DEFAULT 1  -- 0: answered in «Избранное» (a repeat), kept out of the rating
);

CREATE TABLE IF NOT EXISTS favorites (
    kind TEXT NOT NULL CHECK (kind IN ('puzzle', 'drill')),
    ref_id INTEGER NOT NULL,  -- puzzles.id or drills.id
    at TEXT NOT NULL,
    PRIMARY KEY (kind, ref_id)
);

CREATE TABLE IF NOT EXISTS rating_norms (
    technique TEXT PRIMARY KEY,
    norm_ms INTEGER NOT NULL,  -- median of correct hint-free answers when frozen; never recomputed
    from_attempt_id INTEGER NOT NULL,  -- only this technique's attempts with a larger id are rated
    frozen_at TEXT NOT NULL
);
"""

FAVORITE_KINDS = ("puzzle", "drill")


def now_iso() -> str:
    """Timestamp for the started_at / finished_at / at columns."""
    return datetime.now(UTC).isoformat(timespec="seconds")


def connect(path: str = DEFAULT_DB) -> sqlite3.Connection:
    if path != ":memory:":
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    if path != ":memory:":
        conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(SCHEMA)
    # databases created before these columns existed
    for table, column, ddl in (
        ("games", "daily", "TEXT"),
        ("drills", "kind", "TEXT NOT NULL DEFAULT 'place'"),
        ("drill_attempts", "valid_other", "INTEGER NOT NULL DEFAULT 0"),
        ("drill_attempts", "hint", "INTEGER NOT NULL DEFAULT 0"),
        ("drill_attempts", "rated", "INTEGER NOT NULL DEFAULT 1"),
    ):
        if column not in {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
            conn.commit()
    return conn


def is_favorite(conn, kind: str, ref_id: int) -> bool:
    return conn.execute("SELECT 1 FROM favorites WHERE kind = ? AND ref_id = ?", (kind, ref_id)).fetchone() is not None


def favorite_counts(conn) -> dict:
    counts = dict(conn.execute("SELECT kind, COUNT(*) FROM favorites GROUP BY kind").fetchall())
    return {k: counts.get(k, 0) for k in FAVORITE_KINDS}
