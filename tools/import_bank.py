"""Import puzzles from grantm/sudoku-exchange-puzzle-bank (public domain) and seed theory.

Usage: python3 tools/import_bank.py [--n 5000] [--db data/sudoku.db] [--theory-only]
"""

import argparse
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import DEFAULT_DB, connect  # noqa: E402
from sudoku_core import count_solutions, grade, parse, solve, to_str  # noqa: E402

BANK_URL = "https://raw.githubusercontent.com/grantm/sudoku-exchange-puzzle-bank/master/{}.txt"
LEVELS = {"easy": "easy", "medium": "medium", "hard": "hard", "diabolical": "expert"}
RECORD = 100  # bytes per line in the bank files
THEORY_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "theory")


def fetch(bank_file: str, n: int) -> list:
    req = urllib.request.Request(BANK_URL.format(bank_file), headers={"Range": f"bytes=0-{n * RECORD - 1}"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode().splitlines()[:n]


def import_lines(conn, lines, level: str) -> int:
    added = 0
    for line in lines:
        parts = line.split()
        if len(parts) != 3:
            continue
        bank_id, digits, rating = parts
        g = parse(digits)
        if count_solutions(g) != 1:
            continue
        cur = conn.execute(
            "INSERT OR IGNORE INTO puzzles (bank_id, level, givens, solution, se_rating, tech_grade)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (bank_id, level, digits, to_str(solve(g)), float(rating), grade(g)),
        )
        added += cur.rowcount
    conn.commit()
    return added


def import_level(conn, bank_file: str, level: str, n: int) -> int:
    return import_lines(conn, fetch(bank_file, n), level)


def parse_theory(text: str):
    """Split '---' frontmatter (key: value) from the markdown body."""
    if not text.startswith("---"):
        raise ValueError("нет frontmatter")
    _, head, body = text.split("---", 2)
    meta = {}
    for line in head.strip().splitlines():
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()
    return meta, body.strip()


def seed_theory(conn, theory_dir: str = THEORY_DIR) -> int:
    if not os.path.isdir(theory_dir):
        return 0
    n = 0
    for name in sorted(os.listdir(theory_dir)):
        if not name.endswith(".md"):
            continue
        with open(os.path.join(theory_dir, name), encoding="utf-8") as f:
            meta, body = parse_theory(f.read())
        conn.execute(
            "INSERT OR REPLACE INTO techniques (slug, title, level, ord, drill, body_md) VALUES (?, ?, ?, ?, ?, ?)",
            (meta["slug"], meta["title"], int(meta["level"]), int(meta["order"]), meta.get("drill") or None, body),
        )
        n += 1
    conn.commit()
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=5000)
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--theory-only", action="store_true", help="skip the bank download")
    ap.add_argument("--if-empty", action="store_true", help="download the bank only if there are no puzzles")
    args = ap.parse_args()
    conn = connect(args.db)
    has_puzzles = conn.execute("SELECT 1 FROM puzzles LIMIT 1").fetchone()
    if not args.theory_only and not (args.if_empty and has_puzzles):
        for bank_file, level in LEVELS.items():
            added = import_level(conn, bank_file, level, args.n)
            print(f"{level}: +{added}", flush=True)
    try:
        from drills import make_drills
    except ImportError:
        make_drills = None
    if make_drills and not conn.execute("SELECT 1 FROM drills LIMIT 1").fetchone():
        print(f"drills: +{make_drills(conn)}", flush=True)
    print(f"theory: {seed_theory(conn)}", flush=True)


if __name__ == "__main__":
    main()
