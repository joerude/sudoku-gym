"""Recompute puzzles.tech_grade after the core learns new techniques.

Usage: python3 tools/regrade.py [--db data/sudoku.db]
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import DEFAULT_DB, connect  # noqa: E402
from sudoku_core import grade, parse  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    conn = connect(ap.parse_args().db)
    rows = conn.execute("SELECT id, givens FROM puzzles").fetchall()
    conn.executemany("UPDATE puzzles SET tech_grade = ? WHERE id = ?", [(grade(parse(g)), i) for i, g in rows])
    conn.commit()
    for level, grades in conn.execute(
        "SELECT level, GROUP_CONCAT(tech_grade || ':' || n, ' ') FROM "
        "(SELECT level, tech_grade, COUNT(*) n FROM puzzles GROUP BY level, tech_grade) GROUP BY level"
    ):
        print(level, grades)


if __name__ == "__main__":
    main()
