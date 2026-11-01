"""Drill rating, like the lichess puzzle rating: Elo against a fixed 1500 opponent, scored by time.

A correct answer scores 1 / (1 + (t / norm)²) — 0.5 at the technique's norm, 0.8 twice as fast — and a wrong
or revealed one 0. The norm is the median of the technique's correct hint-free answers, frozen once it has
NORM_MIN_CORRECT of them, so 1500 means answering at your frozen norm without mistakes (a wrong answer
scores 0: the same speed with mistakes sits below 1500).

Only the norms are stored: the rating is replayed from drill_attempts, so a change of formula or K
recomputes the whole history."""

import statistics
from datetime import datetime

from db import now_iso
from drills import NEUTRAL, available_techniques

BASE = 1500
NORM_MIN_CORRECT = 10  # correct hint-free answers before a technique's norm freezes
NORM_WINDOW = 10  # the norm is the median of the last N of them
PROVISIONAL_N = 30  # the first N rated attempts move the rating faster
K_PROVISIONAL, K_STABLE = 40, 20


def score(time_ms: int, norm_ms: int, correct) -> float:
    return 1 / (1 + (time_ms / max(norm_ms, 1)) ** 2) if correct else 0.0


def expected(r: float) -> float:
    return 1 / (1 + 10 ** ((BASE - r) / 400))


def _correct_times(conn, technique: str) -> list:
    """Correct hint-free answer times, newest first."""
    return [
        r[0]
        for r in conn.execute(
            "SELECT a.time_ms FROM drill_attempts a JOIN drills d ON d.id = a.drill_id"
            " WHERE d.technique = ? AND a.correct = 1 AND a.hint = 0 ORDER BY a.id DESC",
            (technique,),
        )
    ]


def freeze_norms(conn) -> list:
    """Freeze the norm of every technique that has reached NORM_MIN_CORRECT and has none yet; returns their slugs."""
    have = {r[0] for r in conn.execute("SELECT technique FROM rating_norms")}
    frozen = []
    for t in available_techniques(conn):
        times = [] if t in have else _correct_times(conn, t)
        if len(times) < NORM_MIN_CORRECT:
            continue
        last = conn.execute(
            "SELECT MAX(a.id) FROM drill_attempts a JOIN drills d ON d.id = a.drill_id WHERE d.technique = ?", (t,)
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO rating_norms (technique, norm_ms, from_attempt_id, frozen_at) VALUES (?, ?, ?, ?)",
            (t, max(1, round(statistics.median(times[:NORM_WINDOW]))), last, now_iso()),
        )
        frozen.append(t)
    if frozen:
        conn.commit()
    return frozen


def calibrating(conn, technique: str) -> dict | None:
    """{n, need} while the technique has no norm yet, else None."""
    if conn.execute("SELECT 1 FROM rating_norms WHERE technique = ?", (technique,)).fetchone():
        return None
    return {"n": min(len(_correct_times(conn, technique)), NORM_MIN_CORRECT), "need": NORM_MIN_CORRECT}


def replay(conn, technique: str | None = None) -> list:
    """[{attempt_id, at, rating, delta}] for every rated attempt in order (of one technique if given)."""
    sql = (
        "SELECT a.id, a.at, a.time_ms, a.correct, n.norm_ms FROM drill_attempts a"
        " JOIN drills d ON d.id = a.drill_id JOIN rating_norms n ON n.technique = d.technique"
        f" WHERE a.rated = 1 AND a.id > n.from_attempt_id AND NOT {NEUTRAL}"
    )
    args = ()
    if technique is not None:
        sql, args = sql + " AND d.technique = ?", (technique,)
    r, out = float(BASE), []
    for k, (attempt_id, at, time_ms, correct, norm_ms) in enumerate(conn.execute(sql + " ORDER BY a.id", args)):
        delta = (K_PROVISIONAL if k < PROVISIONAL_N else K_STABLE) * (score(time_ms, norm_ms, correct) - expected(r))
        r += delta
        out.append({"attempt_id": attempt_id, "at": at, "rating": r, "delta": delta})
    return out


def _now(pts: list) -> int:
    return round(pts[-1]["rating"]) if pts else BASE


def current(conn) -> dict:
    """{rating, n, provisional, by_technique: {slug: {rating, n, norm_ms} | {calibrating: {n, need}}}}."""
    pts = replay(conn)
    norms = dict(conn.execute("SELECT technique, norm_ms FROM rating_norms").fetchall())
    by = {}
    for t in available_techniques(conn):
        if t in norms:
            tp = replay(conn, t)
            by[t] = {"rating": _now(tp), "n": len(tp), "norm_ms": norms[t]}
        else:
            by[t] = {"calibrating": calibrating(conn, t)}
    return {"rating": _now(pts), "n": len(pts), "provisional": len(pts) < PROVISIONAL_N, "by_technique": by}


def outcome(conn, attempt_id: int, technique: str) -> dict:
    """What the answer just recorded did: {rating: {before, after, delta, provisional} | None, calibrating}."""
    pts = replay(conn)
    k = next((i for i, p in enumerate(pts) if p["attempt_id"] == attempt_id), None)
    moved = None
    if k is not None:
        before, after = round(pts[k]["rating"] - pts[k]["delta"]), round(pts[k]["rating"])
        moved = {"before": before, "after": after, "delta": after - before, "provisional": k + 1 < PROVISIONAL_N}
    return {"rating": moved, "calibrating": calibrating(conn, technique)}


def history(conn) -> list:
    """[{day, rating}]: the rating after the last rated attempt of each local day."""
    days = {}
    for p in replay(conn):
        days[datetime.fromisoformat(p["at"]).astimezone().date().isoformat()] = round(p["rating"])
    return [{"day": d, "rating": r} for d, r in days.items()]
