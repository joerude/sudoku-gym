"""Sudoku Gym HTTP server: static files from web/ and the JSON API.

Usage: python3 server.py [--host 127.0.0.1] [--port 8765] [--db data/sudoku.db] [--web web]
"""

import argparse
import json
import os
import random
import re
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

import analysis
import drills
import hints
import rating
from db import DEFAULT_DB, FAVORITE_KINDS, connect, favorite_counts, is_favorite, now_iso
from i18n import get_lang, set_lang, tr
from sudoku_core import GRADE_TITLE, count_solutions, grade, parse, solve, to_str

HERE = os.path.dirname(os.path.abspath(__file__))
THEORY_EN = os.path.join(HERE, "theory", "en")  # English theory pages; the Russian ones are in the DB
LEVELS = ["easy", "medium", "hard", "expert"]
MODES = ("original", "hardcore")
MOVE_KINDS = ("place", "erase", "note", "check", "undo")
FINISH_STATUSES = ("solved", "failed", "abandoned")
DEFAULT_MISTAKE_LIMIT = 3
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
}


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _int(data: dict, key: str, lo=None, hi=None, required=True, default=None):
    if key not in data or data[key] is None:
        if required:
            raise ApiError(400, tr("поле {key} обязательно", key=key))
        return default
    v = data[key]
    if isinstance(v, bool) or not isinstance(v, int):
        raise ApiError(400, tr("поле {key} должно быть целым числом", key=key))
    if (lo is not None and v < lo) or (hi is not None and v > hi):
        raise ApiError(400, tr("поле {key} вне диапазона", key=key))
    return v


# --- API handlers: (conn, match, query, body) -> JSON-able ---------------------------


def api_health(conn, m, q, body):
    return {"ok": True, "puzzles": conn.execute("SELECT COUNT(*) FROM puzzles").fetchone()[0]}


def _puzzle_out(conn, row) -> dict:
    return {
        **dict(row),
        "grade_title": tr(GRADE_TITLE.get(row["tech_grade"], "")),
        "fav": is_favorite(conn, "puzzle", row["id"]),
    }


# entered or pasted grids (api_add_puzzle) are played on purpose:
# never served by level selection, nor counted in options
BANK_ONLY = "bank_id NOT LIKE 'custom-%'"


def api_puzzle(conn, m, q, body):
    if q.get("favorite") == "1":  # a starred puzzle, least recently played first
        row = conn.execute(
            "SELECT p.id, p.level, p.givens, p.solution, p.tech_grade"
            " FROM favorites f JOIN puzzles p ON p.id = f.ref_id WHERE f.kind = 'puzzle'"
            " ORDER BY (SELECT COALESCE(MAX(g.id), 0) FROM games g WHERE g.puzzle_id = p.id),"
            " RANDOM() LIMIT 1"
        ).fetchone()
        if row is None:
            raise ApiError(404, tr("в избранном нет задач"))
        return _puzzle_out(conn, row)
    level = q.get("level", "medium")
    if level != "random" and level not in LEVELS:
        raise ApiError(400, tr("неизвестный уровень: {level}", level=level))
    grade = None
    if "grade" in q:
        if not q["grade"].isdigit() or not 1 <= int(q["grade"]) <= 5:
            raise ApiError(400, tr("grade должен быть 1..5"))
        grade = int(q["grade"])
    cond, args = f" AND {BANK_ONLY}", []
    if grade is not None:
        cond, args = f"{cond} AND tech_grade = ?", [grade]
    if level == "random":
        have = [
            r[0] for r in conn.execute(f"SELECT DISTINCT level FROM puzzles WHERE 1=1{cond}", args) if r[0] in LEVELS
        ]
        if not have:
            raise ApiError(404, tr("нет задач с такими параметрами"))
        level = random.choice(have)
    cols = "id, level, givens, solution, tech_grade"
    row = conn.execute(
        f"SELECT {cols} FROM puzzles WHERE level = ?{cond} AND id NOT IN (SELECT puzzle_id FROM games)"
        " ORDER BY RANDOM() LIMIT 1",
        [level] + args,
    ).fetchone()
    if row is None:  # every puzzle of this kind was played: allow repeats
        row = conn.execute(
            f"SELECT {cols} FROM puzzles WHERE level = ?{cond} ORDER BY RANDOM() LIMIT 1", [level] + args
        ).fetchone()
    if row is None:
        raise ApiError(404, tr("нет задач с такими параметрами"))
    return _puzzle_out(conn, row)


def _add_custom(conn, givens, level="custom"):
    """An entered or pasted grid: validated, graded and stored under the chosen level, 'custom' by default
    (idempotent by level and givens) → the puzzle row. It is never served by level selection."""
    if not isinstance(givens, str):
        raise ApiError(400, tr("поле givens обязательно"))
    if level != "custom" and level not in LEVELS:
        raise ApiError(400, tr("неизвестный уровень: {level}", level=level))
    try:
        g = parse(givens)
    except ValueError as e:
        raise ApiError(400, str(e)) from e
    n = count_solutions(g)
    if n == 0:
        raise ApiError(400, tr("нет решения"))
    if n > 1:
        raise ApiError(400, tr("решение не единственное"))
    givens = to_str(g)
    bank_id = "custom-" + ("" if level == "custom" else level + "-") + givens
    conn.execute(
        "INSERT OR IGNORE INTO puzzles (bank_id, level, givens, solution, se_rating, tech_grade)"
        " VALUES (?, ?, ?, ?, NULL, ?)",
        (bank_id, level, givens, to_str(solve(g)), grade(g)),
    )
    conn.commit()
    return conn.execute(
        "SELECT id, level, givens, solution, tech_grade FROM puzzles WHERE bank_id = ?", (bank_id,)
    ).fetchone()


def api_add_puzzle(conn, m, q, body):
    return _puzzle_out(conn, _add_custom(conn, body.get("givens"), body.get("level", "custom")))


def api_puzzle_options(conn, m, q, body):
    counts = {lv: {} for lv in LEVELS}
    for level, g, n in conn.execute(
        f"SELECT level, tech_grade, COUNT(*) FROM puzzles WHERE {BANK_ONLY}"
        " GROUP BY level, tech_grade ORDER BY level, tech_grade"
    ):
        if level in counts:  # skip 'custom'
            counts[level][str(g)] = n
    return {
        "levels": [{"level": lv, "grades": grades} for lv, grades in counts.items()],
        "grade_titles": {str(k): tr(v) for k, v in GRADE_TITLE.items()},
    }


def api_games_list(conn, m, q, body):
    limit = q.get("limit", "20")
    limit = min(int(limit), 200) if limit.isdigit() else 20
    rows = conn.execute(
        "SELECT g.id, g.puzzle_id, p.level, g.mode, g.status, g.started_at, g.finished_at, g.time_ms, g.mistakes,"
        " g.hints FROM games g JOIN puzzles p ON p.id = g.puzzle_id ORDER BY g.id DESC LIMIT ?",
        (limit,),
    )
    return [dict(r) for r in rows]


def api_create_game(conn, m, q, body):
    puzzle_id = _int(body, "puzzle_id")
    mode = body.get("mode")
    if mode not in MODES:
        raise ApiError(400, tr("mode должен быть original или hardcore"))
    limit = None
    if mode == "original":
        limit = _int(body, "mistake_limit", lo=1, required=False) if "mistake_limit" in body else DEFAULT_MISTAKE_LIMIT
    if not conn.execute("SELECT 1 FROM puzzles WHERE id = ?", (puzzle_id,)).fetchone():
        raise ApiError(404, tr("задача не найдена"))
    daily = None
    if body.get("daily") is True:
        if mode != "hardcore":
            raise ApiError(400, tr("задача дня играется в hardcore"))
        daily = analysis.local_today(conn)
        if puzzle_id != analysis.daily_puzzle_id(conn, daily):
            raise ApiError(400, tr("это не задача дня"))
    # a game left by a reload or navigation would stay "active" forever: close it at its last move
    for (stale,) in conn.execute("SELECT id FROM games WHERE status = 'active'").fetchall():
        moves = analysis.load_moves(conn, stale)
        _close_game(conn, _game(conn, stale), "abandoned", max((mv["t_ms"] for mv in moves), default=0), moves)
    cur = conn.execute(
        "INSERT INTO games (puzzle_id, mode, mistake_limit, started_at, status, daily)"
        " VALUES (?, ?, ?, ?, 'active', ?)",
        (puzzle_id, mode, limit, now_iso(), daily),
    )
    conn.commit()
    return {"id": cur.lastrowid}


def _game(conn, game_id):
    game = analysis.game_info(conn, game_id)
    if game is None:
        raise ApiError(404, tr("партия не найдена"))
    return game


def api_get_game(conn, m, q, body):
    gid = int(m.group(1))
    return {**_game(conn, gid), "moves": analysis.load_moves(conn, gid)}


def _validate_move(mv) -> tuple:
    if not isinstance(mv, dict):
        raise ApiError(400, tr("ход должен быть объектом"))
    seq, t_ms = _int(mv, "seq", lo=0), _int(mv, "t_ms", lo=0)
    kind = mv.get("kind")
    if kind not in MOVE_KINDS:
        raise ApiError(400, tr("неизвестный тип хода: {kind}", kind=kind))
    cell = _int(mv, "cell", 0, 80, required=kind != "check")
    if kind == "place":
        value = _int(mv, "value", 1, 9)
    elif kind == "undo":
        value = _int(mv, "value", 0, 9, required=False, default=0)
    else:
        value = _int(mv, "value", 0, 9, required=False)
    return seq, t_ms, cell, value, kind


def _board(body, givens: str) -> list:
    """The position a hint or analysis is asked for: 81 digits (0 = empty) that keep the puzzle's givens."""
    b = body.get("board")
    if not isinstance(b, str) or len(b) != 81 or not (b.isascii() and b.isdigit()):
        raise ApiError(400, tr("поле board — 81 цифра (0 — пусто)"))
    if any(g != "0" and g != c for g, c in zip(givens, b, strict=True)):
        raise ApiError(400, tr("board не совпадает с условием"))
    return [int(c) for c in b]


def _masks(body, key: str):
    """81 candidate bit masks (bit v = digit v) or None when the field is absent."""
    m = body.get(key)
    if m is None:
        return None
    if (
        not isinstance(m, list)
        or len(m) != 81
        or any(isinstance(x, bool) or not isinstance(x, int) or not 0 <= x < 1024 for x in m)
    ):
        raise ApiError(400, tr("поле {key} — 81 битовая маска", key=key))
    return m


def api_game_analysis(conn, m, q, body):
    game = _game(conn, int(m.group(1)))
    board, cands = _board(body, game["givens"]), _masks(body, "cands")
    givens, solution = game["givens"], game["solution"]
    line = hints.solve_line(givens, solution, board, cands)
    return {
        "wrong_cells": line["wrong_cells"],
        "next": hints.next_ladder(givens, solution, board, cands=cands),
        "line": line["steps"],
        "solved": line["solved"],
    }


def api_game_hint(conn, m, q, body):
    gid = int(m.group(1))
    game = _game(conn, gid)
    if game["status"] != "active":
        raise ApiError(400, tr("партия уже закончена"))
    board, notes = _board(body, game["givens"]), _masks(body, "notes")
    level, t_ms = _int(body, "level", 1, 4), _int(body, "t_ms", lo=0)
    lad = hints.next_ladder(game["givens"], game["solution"], board, notes)
    level = min(level, lad["max_level"])
    cell, value = lad["levels"][-1]["place"] or (None, None)
    with conn:
        conn.execute(
            "INSERT INTO game_hints (game_id, t_ms, level, kind, technique, cell, value) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (gid, t_ms, level, lad["kind"], lad["technique"], cell, value),
        )
    return {**lad, "levels": lad["levels"][:level], "level": level}


def api_moves(conn, m, q, body):
    gid = int(m.group(1))
    game = _game(conn, gid)
    moves = body.get("moves")
    if not isinstance(moves, list):
        raise ApiError(400, tr("поле moves должно быть списком"))
    rows = [_validate_move(mv) for mv in moves]
    solution = game["solution"]
    with conn:
        for seq, t_ms, cell, value, kind in rows:
            correct = int(solution[cell] == str(value)) if kind == "place" else None
            conn.execute(
                "INSERT OR REPLACE INTO moves (game_id, seq, t_ms, cell, value, kind, correct)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (gid, seq, t_ms, cell, value, kind, correct),
            )
    mistakes = conn.execute(
        "SELECT COUNT(*) FROM moves WHERE game_id = ? AND kind = 'place' AND correct = 0", (gid,)
    ).fetchone()[0]
    return {"ok": True, "stored": len(rows), "mistakes": mistakes}


def api_finish(conn, m, q, body):
    gid = int(m.group(1))
    game = _game(conn, gid)
    status = body.get("status")
    if status not in FINISH_STATUSES:
        raise ApiError(400, tr("status должен быть solved, failed или abandoned"))
    return _close_game(conn, game, status, _int(body, "t_ms", lo=0))


def _close_game(conn, game, status, t_ms, moves=None):
    gid = game["id"]
    metrics = analysis.compute_metrics(analysis.load_moves(conn, gid) if moves is None else moves, t_ms)
    limit = game["mistake_limit"]
    if game["mode"] == "original" and limit is not None and metrics["mistakes"] >= limit:
        status = "failed"
    n_hints = conn.execute("SELECT COUNT(*) FROM game_hints WHERE game_id = ?", (gid,)).fetchone()[0]
    finished_at = now_iso()
    with conn:
        conn.execute(
            "UPDATE games SET status = ?, finished_at = ?, time_ms = ?, mistakes = ?, corrections = ?, checks = ?,"
            " note_actions = ?, first_move_ms = ?, max_pause_ms = ?, long_pauses = ?, hints = ? WHERE id = ?",
            (
                status,
                finished_at,
                metrics["time_ms"],
                metrics["mistakes"],
                metrics["corrections"],
                metrics["checks"],
                metrics["note_actions"],
                metrics["first_move_ms"],
                metrics["max_pause_ms"],
                metrics["long_pauses"],
                n_hints,
                gid,
            ),
        )
    return {
        "id": gid,
        "status": status,
        "finished_at": finished_at,
        "mode": game["mode"],
        "mistake_limit": limit,
        "hints": n_hints,
        **metrics,
    }


def api_review(conn, m, q, body):
    r = analysis.review(conn, int(m.group(1)))
    if r is None:
        raise ApiError(404, tr("партия не найдена"))
    r["game"]["fav"] = is_favorite(conn, "puzzle", r["game"]["puzzle_id"])
    return r


def api_stats(conn, m, q, body):
    return analysis.stats(conn)


def api_activity(conn, m, q, body):
    return analysis.activity(conn)


def api_records(conn, m, q, body):
    return analysis.records(conn)


def api_daily(conn, m, q, body):
    day = analysis.local_today(conn)
    pid = analysis.daily_puzzle_id(conn, day)
    if pid is None:
        raise ApiError(404, tr("нет задач с такими параметрами"))
    row = conn.execute("SELECT id, level, givens, solution, tech_grade FROM puzzles WHERE id = ?", (pid,)).fetchone()
    return {"day": day, "puzzle": _puzzle_out(conn, row), **analysis.daily_today(conn, day)}


def api_daily_history(conn, m, q, body):
    return analysis.daily_history(conn)


def api_drill_techniques(conn, m, q, body):
    return drills.technique_list(conn)


def api_drill_next(conn, m, q, body):
    technique = q.get("technique") or None
    try:
        d = drills.next_drill(conn, technique)
    except ValueError as e:
        raise ApiError(400, str(e)) from e
    if d is None:
        raise ApiError(404, tr("в избранном нет упражнений") if technique == "favorites" else tr("упражнений нет"))
    return d


def _rated(conn, res):
    """The drill's answer plus what it did to the rating; freezes a technique's norm once it is due."""
    attempt_id, technique = res.pop("attempt_id"), res.pop("technique")
    rating.freeze_norms(conn)
    res.update(rating.outcome(conn, attempt_id, technique))
    return res


def api_drill_attempt(conn, m, q, body):
    time_ms, cell, value = _int(body, "time_ms", lo=0), _int(body, "cell", 0, 80), _int(body, "value", 1, 9)
    hint = _int(body, "hint", 0, 1, required=False, default=0)
    rated = _int(body, "rated", 0, 1, required=False, default=1)
    res = drills.attempt(conn, int(m.group(1)), time_ms, cell, value, hint, rated)
    if res is None:
        raise ApiError(404, tr("упражнение не найдено"))
    return _rated(conn, res)


def api_drill_reveal(conn, m, q, body):
    rated = _int(body, "rated", 0, 1, required=False, default=1)
    res = drills.reveal(conn, int(m.group(1)), _int(body, "time_ms", lo=0), rated)
    if res is None:
        raise ApiError(404, tr("упражнение не найдено"))
    return _rated(conn, res)


def api_drill_hint(conn, m, q, body):
    res = drills.hint(conn, int(m.group(1)))
    if res is None:
        raise ApiError(404, tr("упражнение не найдено"))
    return res


def api_rating(conn, m, q, body):
    return {**rating.current(conn), "history": rating.history(conn)}


def api_favorites(conn, m, q, body):
    return favorite_counts(conn)


def _favorite_target(conn, m):
    kind, ref_id = m.group(1), int(m.group(2))
    table = {"puzzle": "puzzles", "drill": "drills"}.get(kind)
    if table is None:
        raise ApiError(404, tr("в избранное можно добавить только: {kinds}", kinds=", ".join(FAVORITE_KINDS)))
    if not conn.execute(f"SELECT 1 FROM {table} WHERE id = ?", (ref_id,)).fetchone():
        raise ApiError(404, tr("задача не найдена") if kind == "puzzle" else tr("упражнение не найдено"))
    return kind, ref_id


def api_favorite_add(conn, m, q, body):
    kind, ref_id = _favorite_target(conn, m)
    conn.execute("INSERT OR IGNORE INTO favorites (kind, ref_id, at) VALUES (?, ?, ?)", (kind, ref_id, now_iso()))
    conn.commit()
    return {"fav": True, "counts": favorite_counts(conn)}


def api_favorite_remove(conn, m, q, body):
    kind, ref_id = _favorite_target(conn, m)
    conn.execute("DELETE FROM favorites WHERE kind = ? AND ref_id = ?", (kind, ref_id))
    conn.commit()
    return {"fav": False, "counts": favorite_counts(conn)}


def api_favorites_export(conn, m, q, body):
    """Starred puzzles and drills by keys that survive another database: bank_id, (technique, board)."""
    puzzles = conn.execute(
        "SELECT p.bank_id FROM favorites f JOIN puzzles p ON p.id = f.ref_id"
        " WHERE f.kind = 'puzzle' ORDER BY f.at, f.ref_id"
    )
    drill_rows = conn.execute(
        "SELECT d.technique, d.board FROM favorites f JOIN drills d ON d.id = f.ref_id"
        " WHERE f.kind = 'drill' ORDER BY f.at, f.ref_id"
    )
    return {
        "puzzles": [{"bank_id": r[0]} for r in puzzles],
        "drills": [{"technique": r[0], "board": r[1]} for r in drill_rows],
    }


def api_favorites_import(conn, m, q, body):
    """Adds the exported favourites (never removes); an unknown custom-[<level>-]<givens> puzzle is created again."""
    puzzles, drill_refs = body.get("puzzles", []), body.get("drills", [])
    if not all(isinstance(x, list) and all(isinstance(e, dict) for e in x) for x in (puzzles, drill_refs)):
        raise ApiError(400, tr("puzzles и drills должны быть списками объектов"))
    found, missing = [], 0
    for p in puzzles:
        bank_id = p.get("bank_id")
        row = (
            conn.execute("SELECT id FROM puzzles WHERE bank_id = ?", (bank_id,)).fetchone()
            if isinstance(bank_id, str)
            else None
        )
        if row is None and isinstance(bank_id, str) and bank_id.startswith("custom-"):
            level, _, givens = bank_id[len("custom-") :].rpartition("-")  # givens never contain "-"
            try:
                row = _add_custom(conn, givens, level or "custom")
            except ApiError:
                row = None
        if row is None:
            missing += 1
        else:
            found.append(("puzzle", row["id"]))
    for d in drill_refs:
        tech, board = d.get("technique"), d.get("board")
        row = (
            conn.execute(
                "SELECT id FROM drills WHERE technique = ? AND board = ? ORDER BY id", (tech, board)
            ).fetchone()
            if isinstance(tech, str) and isinstance(board, str)
            else None
        )
        if row is None:
            missing += 1
        else:
            found.append(("drill", row["id"]))
    at = now_iso()
    added = sum(
        conn.execute("INSERT OR IGNORE INTO favorites (kind, ref_id, at) VALUES (?, ?, ?)", (kind, ref_id, at)).rowcount
        for kind, ref_id in found
    )
    conn.commit()
    return {"added": added, "missing": missing, "counts": favorite_counts(conn)}


def _theory_en(slug: str) -> dict:
    """{title, body_md} from theory/en/<slug>.md for an English request; {} keeps the Russian page from the DB."""
    path = os.path.join(THEORY_EN, slug + ".md")
    if get_lang() != "en" or not re.fullmatch(r"[a-z0-9-]+", slug) or not os.path.isfile(path):
        return {}
    with open(path, encoding="utf-8") as f:
        _, head, body = f.read().split("---", 2)
    meta = dict(line.split(":", 1) for line in head.strip().splitlines())
    return {"title": meta.get("title", slug).strip(), "body_md": body.strip()}


def api_theory_list(conn, m, q, body):
    rows = conn.execute("SELECT slug, title, level, ord, drill FROM techniques ORDER BY ord, slug")
    return [{**dict(r), **{k: v for k, v in _theory_en(r["slug"]).items() if k == "title"}} for r in rows]


def api_theory_page(conn, m, q, body):
    row = conn.execute(
        "SELECT slug, title, level, ord, drill, body_md FROM techniques WHERE slug = ?", (unquote(m.group(1)),)
    ).fetchone()
    if row is None:
        raise ApiError(404, tr("страница теории не найдена"))
    return {**dict(row), **_theory_en(row["slug"])}


ROUTES = [
    ("GET", r"/api/health", api_health),
    ("GET", r"/api/puzzle", api_puzzle),
    ("GET", r"/api/puzzle/options", api_puzzle_options),
    ("POST", r"/api/puzzles", api_add_puzzle),
    ("GET", r"/api/games", api_games_list),
    ("POST", r"/api/games", api_create_game),
    ("GET", r"/api/games/(\d+)", api_get_game),
    ("POST", r"/api/games/(\d+)/moves", api_moves),
    ("POST", r"/api/games/(\d+)/finish", api_finish),
    ("GET", r"/api/games/(\d+)/review", api_review),
    ("POST", r"/api/games/(\d+)/analysis", api_game_analysis),
    ("POST", r"/api/games/(\d+)/hint", api_game_hint),
    ("GET", r"/api/stats", api_stats),
    ("GET", r"/api/activity", api_activity),
    ("GET", r"/api/records", api_records),
    ("GET", r"/api/daily", api_daily),
    ("GET", r"/api/daily/history", api_daily_history),
    ("GET", r"/api/drills/techniques", api_drill_techniques),
    ("GET", r"/api/drills/next", api_drill_next),
    ("POST", r"/api/drills/(\d+)/attempt", api_drill_attempt),
    ("GET", r"/api/drills/(\d+)/hint", api_drill_hint),
    ("POST", r"/api/drills/(\d+)/reveal", api_drill_reveal),
    ("GET", r"/api/rating", api_rating),
    ("GET", r"/api/favorites", api_favorites),
    ("GET", r"/api/favorites/export", api_favorites_export),
    ("POST", r"/api/favorites/import", api_favorites_import),
    ("PUT", r"/api/favorites/([a-z]+)/(\d+)", api_favorite_add),
    ("DELETE", r"/api/favorites/([a-z]+)/(\d+)", api_favorite_remove),
    ("GET", r"/api/theory", api_theory_list),
    ("GET", r"/api/theory/([^/]+)", api_theory_page),
]
ROUTES = [(method, re.compile(pattern + "$"), fn) for method, pattern, fn in ROUTES]


class Handler(BaseHTTPRequestHandler):
    server_version = "SudokuGym/1.0"

    def log_message(self, fmt, *args):
        if getattr(self.server, "verbose", False):
            super().log_message(fmt, *args)

    def send_json(self, status: int, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def read_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw.decode("utf-8")) if raw else {}
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiError(400, tr("некорректный JSON")) from None
        if not isinstance(data, dict):
            raise ApiError(400, tr("тело запроса должно быть JSON-объектом"))
        return data

    def handle_api(self, method: str, path: str, query: str):
        try:
            body = self.read_body() if method == "POST" else {}
            for m_, pattern, fn in ROUTES:
                match = pattern.match(path) if m_ == method else None
                if match:
                    q = {k: v[-1] for k, v in parse_qs(query).items()}
                    with self.server.lock:
                        result = fn(self.server.conn, match, q, body)
                    self.send_json(200, result)
                    return
            raise ApiError(404, tr("нет такого маршрута: {method} {path}", method=method, path=path))
        except ApiError as e:
            self.send_json(e.status, {"error": str(e)})
        except Exception as e:  # pragma: no cover - unexpected bug
            traceback.print_exc()
            self.send_json(500, {"error": tr("внутренняя ошибка: {e}", e=e)})

    def serve_static(self, path: str):
        root = self.server.web_root
        rel = unquote(path).lstrip("/") or "index.html"
        full = os.path.realpath(os.path.join(root, rel))
        if not full.startswith(root + os.sep) or not os.path.isfile(full):
            self.send_json(404, {"error": tr("файл не найден")})
            return
        with open(full, "rb") as f:
            data = f.read()
        ctype = CONTENT_TYPES.get(os.path.splitext(full)[1].lower(), "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def dispatch(self, method: str):
        set_lang(self.headers.get("X-Lang"))  # api.js sends the page language
        parts = urlsplit(self.path)
        if parts.path == "/api" or parts.path.startswith("/api/"):
            self.handle_api(method, parts.path, parts.query)
        elif method == "GET":
            self.serve_static(parts.path)
        else:
            self.send_json(404, {"error": tr("не найдено")})

    def do_GET(self):
        self.dispatch("GET")

    def do_POST(self):
        self.dispatch("POST")

    def do_PUT(self):
        self.dispatch("PUT")

    def do_DELETE(self):
        self.dispatch("DELETE")


class GymServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 64  # default backlog of 5 resets connections when the page sends several requests at once

    def server_close(self):
        super().server_close()
        self.conn.close()


def make_server(db_path: str, port: int, web_dir: str = "web", host: str = "127.0.0.1") -> ThreadingHTTPServer:
    """One shared sqlite connection guarded by a lock: every API call is serialized."""
    server = GymServer((host, port), Handler)
    server.conn = connect(db_path)
    rating.freeze_norms(server.conn)  # techniques that already have enough history start rated today
    server.lock = threading.Lock()
    server.web_root = os.path.realpath(web_dir if os.path.isabs(web_dir) else os.path.join(HERE, web_dir))
    server.verbose = False
    return server


def main():
    ap = argparse.ArgumentParser(description="Sudoku Gym server")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--web", default="web")
    args = ap.parse_args()
    server = make_server(args.db, args.port, web_dir=args.web, host=args.host)
    server.verbose = True
    print(f"Sudoku Gym: http://{args.host}:{server.server_address[1]}/  (db: {args.db})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nостановлен", file=sys.stderr)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
