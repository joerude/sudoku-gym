"""Game analytics: replay, metrics from moves, pause review and overall statistics."""

import statistics
from datetime import date, timedelta

from drills import NEUTRAL, THEORY_SLUG
from i18n import tr
from sudoku_core import TECH_TIER, TECH_TITLE, easiest_steps, parse, to_str, unit_name

LONG_PAUSE_MS = 20000
MAX_REVIEW_STEPS = 6
LEVEL_ORDER = {"easy": 0, "medium": 1, "hard": 2, "expert": 3}
FINISHED = ("solved", "failed")


def _sorted(moves):
    return sorted(moves, key=lambda m: m["seq"])


def replay(givens: str, moves: list, upto_seq: int | None = None) -> list:
    """Board after the moves with seq <= upto_seq (all if None).

    place → value; erase → 0; undo → value (0 = empty); note/check leave the grid alone. Givens never change."""
    g = parse(givens)
    fixed = [v != 0 for v in g]
    for m in _sorted(moves):
        if upto_seq is not None and m["seq"] > upto_seq:
            break
        cell = m.get("cell")
        if cell is None or not 0 <= cell < 81 or fixed[cell]:
            continue
        kind = m["kind"]
        if kind == "place":
            g[cell] = m["value"] or 0
        elif kind == "erase":
            g[cell] = 0
        elif kind == "undo":
            g[cell] = m.get("value") or 0
    return g


def _gaps(moves):
    """(after_seq, start_ms, duration_ms) between consecutive places, the first one measured from 0."""
    prev_seq, prev_t, out = 0, 0, []
    for m in _sorted(moves):
        if m["kind"] == "place":
            out.append((prev_seq, prev_t, max(0, m["t_ms"] - prev_t)))
            prev_seq, prev_t = m["seq"], m["t_ms"]
    return out


def pauses(moves: list, threshold: int = LONG_PAUSE_MS) -> list:
    """Pauses longer than threshold. after_seq = seq of the place that started it (0 = game start)."""
    return [{"after_seq": s, "start_ms": t, "duration_ms": d} for s, t, d in _gaps(moves) if d > threshold]


def compute_metrics(moves: list, end_ms: int) -> dict:
    gaps = _gaps(moves)
    user = {}  # cell -> value entered by the player
    mistakes = corrections = checks = notes = 0
    for m in _sorted(moves):
        kind, cell = m["kind"], m.get("cell")
        if kind == "place":
            if m.get("correct") == 0:
                mistakes += 1
            if user.get(cell):
                corrections += 1
            user[cell] = m.get("value") or 0
        elif kind == "erase":
            if user.get(cell):
                corrections += 1
            user[cell] = 0
        elif kind == "undo":
            user[cell] = m.get("value") or 0
        elif kind == "check":
            checks += 1
        elif kind == "note":
            notes += 1
    return {
        "time_ms": end_ms,
        "first_move_ms": gaps[0][2] if gaps else None,
        "max_pause_ms": max(d for _, _, d in gaps) if gaps else None,
        "long_pauses": sum(1 for _, _, d in gaps if d > LONG_PAUSE_MS),
        "mistakes": mistakes,
        "corrections": corrections,
        "checks": checks,
        "note_actions": notes,
    }


def game_info(conn, game_id: int) -> dict | None:
    """Game row plus the puzzle's level, givens, solution and tech_grade; None if unknown."""
    row = conn.execute(
        "SELECT g.*, p.level, p.givens, p.solution, p.tech_grade FROM games g JOIN puzzles p ON p.id = g.puzzle_id"
        " WHERE g.id = ?",
        (game_id,),
    ).fetchone()
    return dict(row) if row else None


def load_moves(conn, game_id: int) -> list:
    return [
        dict(r)
        for r in conn.execute(
            "SELECT seq, t_ms, cell, value, kind, correct FROM moves WHERE game_id = ? ORDER BY seq", (game_id,)
        )
    ]


def _step_dict(st) -> dict:
    return {
        "technique": st.technique,
        "title": tr(TECH_TITLE[st.technique]),
        "cell": st.cell,
        "value": st.value,
        "unit": st.unit,
        "unit_name": None if st.unit is None else unit_name(st.unit),
        "eliminations": [list(e) for e in st.eliminations],
    }


def _distinct(steps) -> list:
    """One step per move: a placement found as both naked and hidden single, or the same eliminations, appear once."""
    seen, out = set(), []
    for st in steps:
        key = (st.cell, st.value) if st.cell is not None else frozenset(st.eliminations)
        if key not in seen:
            seen.add(key)
            out.append(st)
    return out


def review(conn, game_id: int) -> dict | None:
    """Long pauses with the position before each and the easiest steps available there."""
    game = game_info(conn, game_id)
    if game is None:
        return None
    moves = load_moves(conn, game_id)
    givens, solution = game["givens"], game["solution"]
    out = []
    for p in pauses(moves):
        board = replay(givens, moves, upto_seq=p["after_seq"]) if p["after_seq"] else parse(givens)
        wrong = [i for i in range(81) if board[i] and givens[i] == "0" and str(board[i]) != solution[i]]
        clean = board[:]
        for i in wrong:
            clean[i] = 0
        out.append(
            {
                **p,
                "board": to_str(board),
                "had_errors": bool(wrong),
                "wrong_cells": wrong,
                "steps": [_step_dict(s) for s in _distinct(easiest_steps(clean))[:MAX_REVIEW_STEPS]],
            }
        )
    return {"game": game, "pauses": out}


def _median(xs):
    return round(statistics.median(xs)) if xs else None


def records(conn) -> list:
    """Personal best per level × mode (all four levels, both modes; empty ones with None).

    Only solved games without «Проверить» count (a check reveals mistakes); on a tie the earlier game keeps it."""
    best = {}
    for gid, level, mode, ms, at in conn.execute(
        "SELECT g.id, p.level, g.mode, g.time_ms, g.started_at FROM games g JOIN puzzles p ON p.id = g.puzzle_id"
        " WHERE g.status = 'solved' AND g.time_ms IS NOT NULL AND COALESCE(g.checks, 0) = 0"
        " ORDER BY g.time_ms, g.id"
    ):
        key = (level, mode)
        if key in best:
            best[key]["solved"] += 1
        else:
            best[key] = {"best_ms": ms, "game_id": gid, "at": at, "solved": 1}
    empty = {"best_ms": None, "game_id": None, "at": None, "solved": 0}
    return [
        {"level": lv, "mode": md, **best.get((lv, md), empty)}
        for lv in sorted(LEVEL_ORDER, key=LEVEL_ORDER.get)
        for md in ("original", "hardcore")
    ]


def stats(conn) -> dict:
    games = conn.execute(
        "SELECT g.status, g.mode, g.time_ms, g.mistakes, date(g.started_at, 'localtime') AS day, p.level"
        " FROM games g JOIN puzzles p ON p.id = g.puzzle_id WHERE g.status IN (?, ?) ORDER BY g.id",
        FINISHED,
    ).fetchall()

    def group(key):
        groups = {}
        for g in games:
            groups.setdefault(key(g), []).append(g)
        return groups

    by_lm = []
    for (level, mode), gs in sorted(
        group(lambda g: (g["level"], g["mode"])).items(), key=lambda kv: (LEVEL_ORDER.get(kv[0][0], 9), kv[0][1])
    ):
        solved = [g["time_ms"] for g in gs if g["status"] == "solved" and g["time_ms"] is not None]
        by_lm.append(
            {
                "level": level,
                "mode": mode,
                "n": len(gs),
                "solved": len(solved),
                "median_ms": _median(solved),
                "best_ms": min(solved) if solved else None,
                "mistakes_per_game": sum(g["mistakes"] or 0 for g in gs) / len(gs),
                "fail_rate": sum(1 for g in gs if g["status"] == "failed") / len(gs),
            }
        )
    daily = []
    for (day, level, mode), gs in sorted(
        group(lambda g: (g["day"], g["level"], g["mode"])).items(),
        key=lambda kv: (kv[0][0], LEVEL_ORDER.get(kv[0][1], 9), kv[0][2]),
    ):
        solved = [g["time_ms"] for g in gs if g["status"] == "solved" and g["time_ms"] is not None]
        daily.append(
            {
                "day": day,
                "level": level,
                "mode": mode,
                "n": len(gs),
                "solved": len(solved),
                "median_ms": _median(solved),
            }
        )
    attempts = {}
    for t, correct, ms in conn.execute(
        "SELECT d.technique, a.correct, a.time_ms FROM drill_attempts a JOIN drills d ON d.id = a.drill_id"
        f" WHERE NOT {NEUTRAL}"
    ):  # a true move by another technique / right after a hint: neither right nor wrong
        attempts.setdefault(t, []).append((correct, ms))
    techniques = []
    for t in TECH_TIER:
        rows = attempts.get(t, [])
        techniques.append(
            {
                "technique": t,
                "title": tr(TECH_TITLE[t]),
                "kind": "place" if TECH_TIER[t] == 1 else "eliminate",
                "tier": TECH_TIER[t],
                "theory": THEORY_SLUG.get(t),
                "n": len(rows),
                "median_ms": _median([ms for ok, ms in rows if ok]),
                "accuracy": sum(1 for ok, _ in rows if ok) / len(rows) if rows else None,
            }
        )
    return {"by_level_mode": by_lm, "daily": daily, "techniques": techniques}


def activity(conn, today: str | None = None) -> dict:
    """GitHub-style calendar: points per local day (solved games + correct drill attempts), streaks, yearly totals.

    The window is 53 weeks, Monday-first, ending with today's week. The current streak ends today or, while today is
    still empty, yesterday — it is not broken until the day is over."""
    today = today or conn.execute("SELECT date('now', 'localtime')").fetchone()[0]
    per_day = {}
    for day, n in conn.execute(
        "SELECT date(started_at, 'localtime'), COUNT(*) FROM games WHERE status = 'solved' GROUP BY 1"
    ):
        per_day.setdefault(day, {"day": day, "games": 0, "drills": 0})["games"] = n
    for day, n in conn.execute(
        "SELECT date(a.at, 'localtime'), COUNT(*) FROM drill_attempts a"
        f" WHERE a.correct = 1 AND NOT {NEUTRAL} GROUP BY 1"
    ):
        per_day.setdefault(day, {"day": day, "games": 0, "drills": 0})["drills"] = n
    t = date.fromisoformat(today)
    start = (t - timedelta(days=t.weekday() + 52 * 7)).isoformat()
    year_ago = (t - timedelta(days=365)).isoformat()
    days = [per_day[d] for d in sorted(per_day) if start <= d <= today]
    year = [d for d in days if d["day"] > year_ago]

    best = run = 0
    prev = None
    for d in sorted(per_day):
        cur = date.fromisoformat(d)
        run = run + 1 if prev is not None and cur - prev == timedelta(days=1) else 1
        best, prev = max(best, run), cur
    current, k = 0, t if today in per_day else t - timedelta(days=1)
    while k.isoformat() in per_day:
        current, k = current + 1, k - timedelta(days=1)
    return {
        "today": today,
        "days": days,
        "streak": {"current": current, "best": best, "today": today in per_day},
        "totals": {
            "games": sum(d["games"] for d in year),
            "drills": sum(d["drills"] for d in year),
            "active_days": len(year),
        },
    }
