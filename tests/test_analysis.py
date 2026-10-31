import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from analysis import LONG_PAUSE_MS, compute_metrics, game_info, pauses, replay, review, stats  # noqa: E402
from db import connect  # noqa: E402
from fixtures import L1, insert_puzzle  # noqa: E402
from sudoku_core import TECH_TIER, TECH_TITLE, parse, to_str, unit_name  # noqa: E402

_, P, S = L1[0]  # cells 1..4 are empty; solution 4, 7, 2, 8


def mv(seq, t, kind, cell=None, value=None, correct=None):
    return {"seq": seq, "t_ms": t, "kind": kind, "cell": cell, "value": value, "correct": correct}


MOVES = [
    mv(1, 5000, "note", 1, 4),
    mv(2, 13800, "place", 1, 4, 1),
    mv(3, 16000, "place", 2, 9, 0),      # mistake
    mv(4, 18000, "place", 2, 7, 1),      # correction (over the user's 9)
    mv(5, 19000, "check"),
    mv(6, 45000, "place", 3, 2, 1),      # 27 s pause after seq 4
    mv(7, 47000, "erase", 3, 0),         # correction (erases the user's 2)
    mv(8, 48000, "undo", 3, 2),          # restores 2
    mv(9, 80000, "place", 4, 8, 1),      # 35 s pause after seq 6
]


class ReplayTest(unittest.TestCase):
    def test_full_and_partial(self):
        g = replay(P, MOVES)
        self.assertEqual(g[1:5], [4, 7, 2, 8])
        self.assertEqual(replay(P, MOVES, upto_seq=3)[1:5], [4, 9, 0, 0])
        self.assertEqual(replay(P, MOVES, upto_seq=7)[3], 0)
        self.assertEqual(replay(P, MOVES, upto_seq=0), parse(P))

    def test_undo_to_empty_and_order(self):
        moves = [mv(2, 2000, "undo", 5 + 1, 0), mv(1, 1000, "place", 6, 9, 0)]  # out of order on purpose
        self.assertEqual(replay("0" * 81, moves)[6], 0)
        self.assertEqual(replay("0" * 81, moves, upto_seq=1)[6], 9)

    def test_givens_never_change(self):
        g = replay(P, [mv(1, 100, "place", 0, 5, 0), mv(2, 200, "erase", 5, 0), mv(3, 300, "undo", 5, 0)])
        self.assertEqual(g, parse(P))


class MetricsTest(unittest.TestCase):
    def test_metrics(self):
        m = compute_metrics(MOVES, 90000)
        self.assertEqual(m, {
            "time_ms": 90000, "first_move_ms": 13800, "max_pause_ms": 35000, "long_pauses": 2,
            "mistakes": 1, "corrections": 2, "checks": 1, "note_actions": 1,
        })

    def test_no_places(self):
        m = compute_metrics([mv(1, 3000, "note", 1, 4)], 5000)
        self.assertEqual((m["first_move_ms"], m["max_pause_ms"], m["long_pauses"], m["note_actions"]),
                         (None, None, 0, 1))

    def test_pauses(self):
        self.assertEqual(LONG_PAUSE_MS, 20000)
        self.assertEqual(pauses(MOVES), [
            {"after_seq": 4, "start_ms": 18000, "duration_ms": 27000},
            {"after_seq": 6, "start_ms": 45000, "duration_ms": 35000},
        ])
        self.assertEqual(pauses(MOVES, threshold=10000)[0], {"after_seq": 0, "start_ms": 0, "duration_ms": 13800})
        self.assertEqual(len(pauses(MOVES, threshold=0)), 5)


def make_game(conn, pid, moves, mode="hardcore", status="solved", started="2026-10-30T10:00:00+00:00",
              time_ms=None, mistakes=0, limit=None):
    gid = conn.execute(
        "INSERT INTO games (puzzle_id, mode, mistake_limit, started_at, finished_at, status, time_ms, mistakes)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (pid, mode, limit, started, started if status != "active" else None, status, time_ms, mistakes)).lastrowid
    for m in moves:
        conn.execute("INSERT INTO moves (game_id, seq, t_ms, cell, value, kind, correct) VALUES (?, ?, ?, ?, ?, ?, ?)",
                     (gid, m["seq"], m["t_ms"], m["cell"], m["value"], m["kind"], m["correct"]))
    conn.commit()
    return gid


class ReviewTest(unittest.TestCase):
    def setUp(self):
        self.conn = connect(":memory:")
        self.pid = insert_puzzle(self.conn, "L1-1", "easy", P, S)

    def assert_steps_ok(self, pause, board):
        steps = pause["steps"]
        self.assertTrue(1 <= len(steps) <= 6)
        for st in steps:
            self.assertEqual(set(st), {"technique", "title", "cell", "value", "unit", "unit_name", "eliminations"})
            self.assertEqual(TECH_TIER[st["technique"]], 1)
            self.assertEqual(st["title"], TECH_TITLE[st["technique"]])
            self.assertEqual(board[st["cell"]], 0)
            self.assertEqual(int(S[st["cell"]]), st["value"])
            self.assertEqual(st["unit_name"], None if st["unit"] is None else unit_name(st["unit"]))
            self.assertEqual(st["eliminations"], [])

    def test_review_pauses(self):
        gid = make_game(self.conn, self.pid, MOVES, time_ms=90000)
        r = review(self.conn, gid)
        self.assertEqual((r["game"]["id"], r["game"]["givens"], r["game"]["solution"], r["game"]["level"]),
                         (gid, P, S, "easy"))
        self.assertEqual([(p["after_seq"], p["start_ms"], p["duration_ms"]) for p in r["pauses"]],
                         [(4, 18000, 27000), (6, 45000, 35000)])
        first = r["pauses"][0]
        board = replay(P, MOVES, upto_seq=4)
        self.assertEqual(first["board"], to_str(board))
        self.assertEqual((first["had_errors"], first["wrong_cells"]), (False, []))
        self.assert_steps_ok(first, board)

    def test_review_with_errors_and_start_pause(self):
        moves = [mv(1, 25000, "place", 2, 9, 0), mv(2, 60000, "place", 1, 4, 1)]
        gid = make_game(self.conn, self.pid, moves)
        r = review(self.conn, gid)
        self.assertEqual(len(r["pauses"]), 2)
        start, second = r["pauses"]
        self.assertEqual((start["after_seq"], start["duration_ms"], start["board"], start["had_errors"]),
                         (0, 25000, P, False))
        self.assert_steps_ok(start, parse(P))
        self.assertEqual((second["after_seq"], second["duration_ms"], second["had_errors"], second["wrong_cells"]),
                         (1, 35000, True, [2]))
        self.assertEqual(second["board"][2], "9")  # shown as the player saw it
        cleaned = parse(second["board"])
        cleaned[2] = 0
        self.assert_steps_ok(second, cleaned)

    def test_unknown_game(self):
        self.assertIsNone(review(self.conn, 404))
        self.assertIsNone(game_info(self.conn, 404))


class StatsTest(unittest.TestCase):
    def setUp(self):
        self.conn = connect(":memory:")
        c = self.conn
        easy = insert_puzzle(c, "e1", "easy", P, S)
        med = insert_puzzle(c, "m1", "medium", P, S)
        d1, d2 = "2026-10-29T09:00:00+00:00", "2026-10-30T09:00:00+00:00"
        make_game(c, easy, [], "original", "solved", d1, 100000, 0, 3)
        make_game(c, easy, [], "original", "solved", d1, 200000, 1, 3)
        make_game(c, easy, [], "original", "solved", d2, 400000, 2, 3)
        make_game(c, easy, [], "original", "failed", d2, 50000, 3, 3)
        make_game(c, easy, [], "original", "active", d2)
        make_game(c, easy, [], "original", "abandoned", d2, 10000, 0, 3)
        make_game(c, med, [], "hardcore", "solved", d2, 300000, 4)
        did = c.execute("INSERT INTO drills (technique, kind, puzzle_id, board, answers) VALUES"
                        " ('naked_single', 'place', ?, ?, '[]')", (easy, P)).lastrowid
        for t, ok in ((3000, 1), (5000, 1), (1000, 0)):
            c.execute("INSERT INTO drill_attempts (drill_id, at, time_ms, correct) VALUES (?, ?, ?, ?)", (did, d2, t, ok))
        c.commit()

    def test_by_level_mode(self):
        s = stats(self.conn)
        self.assertEqual(s["by_level_mode"], [
            {"level": "easy", "mode": "original", "n": 4, "solved": 3, "median_ms": 200000, "best_ms": 100000,
             "mistakes_per_game": 1.5, "fail_rate": 0.25},
            {"level": "medium", "mode": "hardcore", "n": 1, "solved": 1, "median_ms": 300000, "best_ms": 300000,
             "mistakes_per_game": 4.0, "fail_rate": 0.0},
        ])

    def test_daily(self):
        self.assertEqual(stats(self.conn)["daily"], [
            {"day": "2026-10-29", "level": "easy", "mode": "original", "n": 2, "solved": 2, "median_ms": 150000},
            {"day": "2026-10-30", "level": "easy", "mode": "original", "n": 2, "solved": 1, "median_ms": 400000},
            {"day": "2026-10-30", "level": "medium", "mode": "hardcore", "n": 1, "solved": 1, "median_ms": 300000},
        ])

    def test_techniques(self):
        techs = stats(self.conn)["techniques"]
        self.assertEqual([t["technique"] for t in techs], list(TECH_TIER))
        ns = techs[0]
        self.assertEqual(ns["title"], TECH_TITLE["naked_single"])
        self.assertEqual((ns["n"], ns["median_ms"], ns["kind"], ns["tier"]), (3, 4000, "place", 1))
        self.assertAlmostEqual(ns["accuracy"], 2 / 3)
        self.assertEqual((techs[4]["technique"], techs[4]["n"], techs[4]["median_ms"], techs[4]["accuracy"]),
                         ("pointing", 0, None, None))

    def test_empty(self):
        s = stats(connect(":memory:"))
        self.assertEqual((s["by_level_mode"], s["daily"]), ([], []))


if __name__ == "__main__":
    unittest.main()
