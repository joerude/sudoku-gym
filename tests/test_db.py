import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))

from import_bank import import_lines, parse_theory, seed_theory

from db import connect

LINES = [
    "0000847b216e 020900000048000031000063020009407003003080200400105600030570000250000180000006050  2.3",
    "0000c45fb232 100800570000009210090040000300900050007000300020006008000020040071400000064007003  2.0",
    "deadbeef0000 000000000000000000000000000000000000000000000000000000000000000000000000000000000  9.9",
]


class DbTest(unittest.TestCase):
    def test_schema(self):
        conn = connect(":memory:")
        names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertEqual(
            names, {"puzzles", "games", "moves", "game_hints", "techniques", "drills", "drill_attempts", "favorites"}
        )

    def test_reconnect_file(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "sub", "x.db")
            connect(path).close()
            connect(path).close()
            self.assertTrue(os.path.exists(path))

    def test_migrates_drills_kind(self):
        import sqlite3

        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "old.db")
            old = sqlite3.connect(path)
            old.execute(
                "CREATE TABLE drills (id INTEGER PRIMARY KEY, technique TEXT NOT NULL,"
                " puzzle_id INTEGER NOT NULL, board TEXT NOT NULL, answers TEXT NOT NULL)"
            )
            old.execute(
                "INSERT INTO drills (technique, puzzle_id, board, answers) VALUES ('naked_single', 1, 'b', '[]')"
            )
            old.execute(
                "CREATE TABLE drill_attempts (id INTEGER PRIMARY KEY, drill_id INTEGER NOT NULL, at TEXT NOT NULL,"
                " time_ms INTEGER NOT NULL, correct INTEGER NOT NULL, cell INTEGER, value INTEGER)"
            )
            old.execute("INSERT INTO drill_attempts (drill_id, at, time_ms, correct) VALUES (1, 'x', 1, 0)")
            old.commit()
            old.close()
            conn = connect(path)
            self.assertEqual(conn.execute("SELECT kind FROM drills").fetchone()[0], "place")
            cols = {r[1] for r in conn.execute("PRAGMA table_info(drill_attempts)")}
            self.assertIn("valid_other", cols)
            self.assertEqual(conn.execute("SELECT valid_other FROM drill_attempts").fetchone()[0], 0)
            conn.close()
            connect(path).close()

    def test_migrates_games_hints(self):
        import sqlite3

        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "old.db")
            old = sqlite3.connect(path)
            old.execute(
                "CREATE TABLE games (id INTEGER PRIMARY KEY, puzzle_id INTEGER NOT NULL, mode TEXT NOT NULL,"
                " started_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', time_ms INTEGER)"
            )
            old.execute(
                "INSERT INTO games (puzzle_id, mode, started_at, status, time_ms)"
                " VALUES (1, 'original', 'x', 'solved', 1)"
            )
            old.commit()
            old.close()
            conn = connect(path)
            cols = {r[1] for r in conn.execute("PRAGMA table_info(games)")}
            self.assertIn("hints", cols)
            self.assertEqual(conn.execute("SELECT hints FROM games").fetchone()[0], 0)
            self.assertIsNotNone(
                conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'game_hints'").fetchone()
            )
            conn.close()
            connect(path).close()

    def test_import_is_idempotent_and_skips_non_unique(self):
        conn = connect(":memory:")
        self.assertEqual(import_lines(conn, LINES, "medium"), 2)
        self.assertEqual(import_lines(conn, LINES, "medium"), 0)
        row = conn.execute("SELECT * FROM puzzles WHERE bank_id='0000847b216e'").fetchone()
        self.assertEqual(len(row["solution"]), 81)
        self.assertNotIn("0", row["solution"])
        self.assertEqual(row["se_rating"], 2.3)
        self.assertIn(row["tech_grade"], (1, 2, 3, 4))

    def test_theory(self):
        meta, body = parse_theory("---\nslug: a\ntitle: Т\nlevel: 1\norder: 2\ndrill:\n---\n\n# H\ntext")
        self.assertEqual(meta["drill"], "")
        self.assertEqual(body, "# H\ntext")
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "a.md"), "w", encoding="utf-8") as f:
                f.write("---\nslug: a\ntitle: Т\nlevel: 1\norder: 2\ndrill: naked_single\n---\n# H")
            conn = connect(":memory:")
            self.assertEqual(seed_theory(conn, d), 1)
            self.assertEqual(conn.execute("SELECT drill FROM techniques").fetchone()[0], "naked_single")


if __name__ == "__main__":
    unittest.main()
