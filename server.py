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
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

import analysis
import drills
from db import DEFAULT_DB, FAVORITE_KINDS, connect, favorite_counts, is_favorite
from sudoku_core import GRADE_TITLE, count_solutions, grade, parse, solve, to_str

HERE = os.path.dirname(os.path.abspath(__file__))
LEVELS = ["easy", "medium", "hard", "expert"]
MODES = ("original", "hardcore")
MOVE_KINDS = ("place", "erase", "note", "check", "undo")
FINISH_STATUSES = ("solved", "failed", "abandoned")
DEFAULT_MISTAKE_LIMIT = 3
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2",
}


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _int(data: dict, key: str, lo=None, hi=None, required=True, default=None):
    if key not in data or data[key] is None:
        if required:
            raise ApiError(400, f"поле {key} обязательно")
        return default
    v = data[key]
    if isinstance(v, bool) or not isinstance(v, int):
        raise ApiError(400, f"поле {key} должно быть целым числом")
    if (lo is not None and v < lo) or (hi is not None and v > hi):
        raise ApiError(400, f"поле {key} вне диапазона")
    return v


# --- API handlers: (conn, match, query, body) -> JSON-able ---------------------------

def api_health(conn, m, q, body):
    return {"ok": True, "puzzles": conn.execute("SELECT COUNT(*) FROM puzzles").fetchone()[0]}


def _puzzle_out(conn, row) -> dict:
    return {**dict(row), "grade_title": GRADE_TITLE.get(row["tech_grade"], ""), "fav": is_favorite(conn, "puzzle", row["id"])}


def api_puzzle(conn, m, q, body):
    if q.get("favorite") == "1":  # a starred puzzle, least recently played first
        row = conn.execute(
            "SELECT p.id, p.level, p.givens, p.solution, p.tech_grade FROM favorites f JOIN puzzles p ON p.id = f.ref_id"
            " WHERE f.kind = 'puzzle' ORDER BY (SELECT COALESCE(MAX(g.id), 0) FROM games g WHERE g.puzzle_id = p.id),"
            " RANDOM() LIMIT 1").fetchone()
        if row is None:
            raise ApiError(404, "в избранном нет задач")
        return _puzzle_out(conn, row)
    level = q.get("level", "medium")
    if level != "random" and level not in LEVELS:
        raise ApiError(400, f"неизвестный уровень: {level}")
    grade = None
    if "grade" in q:
        if not q["grade"].isdigit() or not 1 <= int(q["grade"]) <= 5:
            raise ApiError(400, "grade должен быть 1..5")
        grade = int(q["grade"])
    cond, args = "", []
    if grade is not None:
        cond, args = " AND tech_grade = ?", [grade]
    if level == "random":
        have = [r[0] for r in conn.execute(f"SELECT DISTINCT level FROM puzzles WHERE 1=1{cond}", args)
                if r[0] in LEVELS]  # 'custom' (pasted) puzzles are never served at random
        if not have:
            raise ApiError(404, "нет задач с такими параметрами")
        level = random.choice(have)
    cols = "id, level, givens, solution, tech_grade"
    row = conn.execute(
        f"SELECT {cols} FROM puzzles WHERE level = ?{cond} AND id NOT IN (SELECT puzzle_id FROM games)"
        " ORDER BY RANDOM() LIMIT 1", [level] + args).fetchone()
    if row is None:  # every puzzle of this kind was played: allow repeats
        row = conn.execute(f"SELECT {cols} FROM puzzles WHERE level = ?{cond} ORDER BY RANDOM() LIMIT 1",
                           [level] + args).fetchone()
    if row is None:
        raise ApiError(404, "нет задач с такими параметрами")
    return _puzzle_out(conn, row)


def api_add_puzzle(conn, m, q, body):
    """A pasted grid: validated, graded and stored as level 'custom' (idempotent by givens)."""
    givens = body.get("givens")
    if not isinstance(givens, str):
        raise ApiError(400, "поле givens обязательно")
    try:
        g = parse(givens)
    except ValueError as e:
        raise ApiError(400, str(e))
    n = count_solutions(g)
    if n == 0:
        raise ApiError(400, "нет решения")
    if n > 1:
        raise ApiError(400, "решение не единственное")
    givens = to_str(g)
    conn.execute("INSERT OR IGNORE INTO puzzles (bank_id, level, givens, solution, se_rating, tech_grade)"
                 " VALUES (?, 'custom', ?, ?, NULL, ?)", ("custom-" + givens, givens, to_str(solve(g)), grade(g)))
    conn.commit()
    row = conn.execute("SELECT id, level, givens, solution, tech_grade FROM puzzles WHERE bank_id = ?",
                       ("custom-" + givens,)).fetchone()
    return _puzzle_out(conn, row)


def api_puzzle_options(conn, m, q, body):
    counts = {lv: {} for lv in LEVELS}
    for level, g, n in conn.execute("SELECT level, tech_grade, COUNT(*) FROM puzzles GROUP BY level, tech_grade"
                                    " ORDER BY level, tech_grade"):
        if level in counts:  # skip 'custom'
            counts[level][str(g)] = n
    return {"levels": [{"level": lv, "grades": grades} for lv, grades in counts.items()],
            "grade_titles": {str(k): v for k, v in GRADE_TITLE.items()}}


def api_games_list(conn, m, q, body):
    limit = q.get("limit", "20")
    limit = min(int(limit), 200) if limit.isdigit() else 20
    rows = conn.execute(
        "SELECT g.id, g.puzzle_id, p.level, g.mode, g.status, g.started_at, g.finished_at, g.time_ms, g.mistakes"
        " FROM games g JOIN puzzles p ON p.id = g.puzzle_id ORDER BY g.id DESC LIMIT ?", (limit,))
    return [dict(r) for r in rows]


def api_create_game(conn, m, q, body):
    puzzle_id = _int(body, "puzzle_id")
    mode = body.get("mode")
    if mode not in MODES:
        raise ApiError(400, "mode должен быть original или hardcore")
    limit = None
    if mode == "original":
        limit = _int(body, "mistake_limit", lo=1, required=False) if "mistake_limit" in body else DEFAULT_MISTAKE_LIMIT
    if not conn.execute("SELECT 1 FROM puzzles WHERE id = ?", (puzzle_id,)).fetchone():
        raise ApiError(404, "задача не найдена")
    # a game left by a reload or navigation would stay "active" forever: close it at its last move
    for (stale,) in conn.execute("SELECT id FROM games WHERE status = 'active'").fetchall():
        moves = analysis.load_moves(conn, stale)
        _close_game(conn, _game(conn, stale), "abandoned", max((mv["t_ms"] for mv in moves), default=0), moves)
    cur = conn.execute("INSERT INTO games (puzzle_id, mode, mistake_limit, started_at, status) VALUES (?, ?, ?, ?, 'active')",
                       (puzzle_id, mode, limit, now_iso()))
    conn.commit()
    return {"id": cur.lastrowid}


def _game(conn, game_id):
    game = analysis.game_info(conn, game_id)
    if game is None:
        raise ApiError(404, "партия не найдена")
    return game


def api_get_game(conn, m, q, body):
    gid = int(m.group(1))
    return {**_game(conn, gid), "moves": analysis.load_moves(conn, gid)}


def _validate_move(mv) -> tuple:
    if not isinstance(mv, dict):
        raise ApiError(400, "ход должен быть объектом")
    seq, t_ms = _int(mv, "seq", lo=0), _int(mv, "t_ms", lo=0)
    kind = mv.get("kind")
    if kind not in MOVE_KINDS:
        raise ApiError(400, f"неизвестный тип хода: {kind}")
    cell = _int(mv, "cell", 0, 80, required=kind != "check")
    if kind == "place":
        value = _int(mv, "value", 1, 9)
    elif kind == "undo":
        value = _int(mv, "value", 0, 9, required=False, default=0)
    else:
        value = _int(mv, "value", 0, 9, required=False)
    return seq, t_ms, cell, value, kind


def api_moves(conn, m, q, body):
    gid = int(m.group(1))
    game = _game(conn, gid)
    moves = body.get("moves")
    if not isinstance(moves, list):
        raise ApiError(400, "поле moves должно быть списком")
    rows = [_validate_move(mv) for mv in moves]
    solution = game["solution"]
    with conn:
        for seq, t_ms, cell, value, kind in rows:
            correct = int(solution[cell] == str(value)) if kind == "place" else None
            conn.execute("INSERT OR REPLACE INTO moves (game_id, seq, t_ms, cell, value, kind, correct)"
                         " VALUES (?, ?, ?, ?, ?, ?, ?)", (gid, seq, t_ms, cell, value, kind, correct))
    mistakes = conn.execute("SELECT COUNT(*) FROM moves WHERE game_id = ? AND kind = 'place' AND correct = 0",
                            (gid,)).fetchone()[0]
    return {"ok": True, "stored": len(rows), "mistakes": mistakes}


def api_finish(conn, m, q, body):
    gid = int(m.group(1))
    game = _game(conn, gid)
    status = body.get("status")
    if status not in FINISH_STATUSES:
        raise ApiError(400, "status должен быть solved, failed или abandoned")
    return _close_game(conn, game, status, _int(body, "t_ms", lo=0))


def _close_game(conn, game, status, t_ms, moves=None):
    gid = game["id"]
    metrics = analysis.compute_metrics(analysis.load_moves(conn, gid) if moves is None else moves, t_ms)
    limit = game["mistake_limit"]
    if game["mode"] == "original" and limit is not None and metrics["mistakes"] >= limit:
        status = "failed"
    finished_at = now_iso()
    with conn:
        conn.execute(
            "UPDATE games SET status = ?, finished_at = ?, time_ms = ?, mistakes = ?, corrections = ?, checks = ?,"
            " note_actions = ?, first_move_ms = ?, max_pause_ms = ?, long_pauses = ? WHERE id = ?",
            (status, finished_at, metrics["time_ms"], metrics["mistakes"], metrics["corrections"], metrics["checks"],
             metrics["note_actions"], metrics["first_move_ms"], metrics["max_pause_ms"], metrics["long_pauses"], gid))
    return {"id": gid, "status": status, "finished_at": finished_at, "mode": game["mode"],
            "mistake_limit": limit, **metrics}


def api_review(conn, m, q, body):
    r = analysis.review(conn, int(m.group(1)))
    if r is None:
        raise ApiError(404, "партия не найдена")
    r["game"]["fav"] = is_favorite(conn, "puzzle", r["game"]["puzzle_id"])
    return r


def api_stats(conn, m, q, body):
    return analysis.stats(conn)


def api_records(conn, m, q, body):
    return analysis.records(conn)


def api_drill_techniques(conn, m, q, body):
    return drills.technique_list(conn)


def api_drill_next(conn, m, q, body):
    technique = q.get("technique") or None
    try:
        d = drills.next_drill(conn, technique)
    except ValueError as e:
        raise ApiError(400, str(e))
    if d is None:
        raise ApiError(404, "в избранном нет упражнений" if technique == "favorites" else "упражнений нет")
    return d


def api_drill_attempt(conn, m, q, body):
    time_ms, cell, value = _int(body, "time_ms", lo=0), _int(body, "cell", 0, 80), _int(body, "value", 1, 9)
    hint = _int(body, "hint", 0, 1, required=False, default=0)
    res = drills.attempt(conn, int(m.group(1)), time_ms, cell, value, hint)
    if res is None:
        raise ApiError(404, "упражнение не найдено")
    return res


def api_drill_reveal(conn, m, q, body):
    res = drills.reveal(conn, int(m.group(1)), _int(body, "time_ms", lo=0))
    if res is None:
        raise ApiError(404, "упражнение не найдено")
    return res


def api_drill_hint(conn, m, q, body):
    res = drills.hint(conn, int(m.group(1)))
    if res is None:
        raise ApiError(404, "упражнение не найдено")
    return res


def api_favorites(conn, m, q, body):
    return favorite_counts(conn)


def _favorite_target(conn, m):
    kind, ref_id = m.group(1), int(m.group(2))
    table = {"puzzle": "puzzles", "drill": "drills"}.get(kind)
    if table is None:
        raise ApiError(404, f"в избранное можно добавить только: {', '.join(FAVORITE_KINDS)}")
    if not conn.execute(f"SELECT 1 FROM {table} WHERE id = ?", (ref_id,)).fetchone():
        raise ApiError(404, "задача не найдена" if kind == "puzzle" else "упражнение не найдено")
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


def api_theory_list(conn, m, q, body):
    return [dict(r) for r in conn.execute("SELECT slug, title, level, ord, drill FROM techniques ORDER BY ord, slug")]


def api_theory_page(conn, m, q, body):
    row = conn.execute("SELECT slug, title, level, ord, drill, body_md FROM techniques WHERE slug = ?",
                       (unquote(m.group(1)),)).fetchone()
    if row is None:
        raise ApiError(404, "страница теории не найдена")
    return dict(row)


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
    ("GET", r"/api/stats", api_stats),
    ("GET", r"/api/records", api_records),
    ("GET", r"/api/drills/techniques", api_drill_techniques),
    ("GET", r"/api/drills/next", api_drill_next),
    ("POST", r"/api/drills/(\d+)/attempt", api_drill_attempt),
    ("GET", r"/api/drills/(\d+)/hint", api_drill_hint),
    ("POST", r"/api/drills/(\d+)/reveal", api_drill_reveal),
    ("GET", r"/api/favorites", api_favorites),
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
            raise ApiError(400, "некорректный JSON")
        if not isinstance(data, dict):
            raise ApiError(400, "тело запроса должно быть JSON-объектом")
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
            raise ApiError(404, f"нет такого маршрута: {method} {path}")
        except ApiError as e:
            self.send_json(e.status, {"error": str(e)})
        except Exception as e:  # pragma: no cover - unexpected bug
            traceback.print_exc()
            self.send_json(500, {"error": f"внутренняя ошибка: {e}"})

    def serve_static(self, path: str):
        root = self.server.web_root
        rel = unquote(path).lstrip("/") or "index.html"
        full = os.path.realpath(os.path.join(root, rel))
        if not full.startswith(root + os.sep) or not os.path.isfile(full):
            self.send_json(404, {"error": "файл не найден"})
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
        parts = urlsplit(self.path)
        if parts.path == "/api" or parts.path.startswith("/api/"):
            self.handle_api(method, parts.path, parts.query)
        elif method == "GET":
            self.serve_static(parts.path)
        else:
            self.send_json(404, {"error": "не найдено"})

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
