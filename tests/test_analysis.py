import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from analysis import LONG_PAUSE_MS, activity, compute_metrics, game_info, pauses, records, replay, review, stats  # noqa: E402
from db import connect  # noqa: E402
from fixtures import L1, insert_puzzle  # noqa: E402
from sudoku_core import TECH_TIER, TECH_TITLE, parse, to_str, unit_name  # noqa: E402

_, P, S = L1[0]  # cells 1..4 are empty; solution 4, 7, 2, 8


def mv(seq, t, kind, cell=None, value=None, correct=None):
    return {"seq": seq, "t_ms": t, "kind": kind, "cell": cell, "value": value, "correct": correct}


MOVES = [
    mv(1, 5000, "note", 1, 4),
    mv(2, 13800, "place", 1, 4, 1),
    mv(3, 16000, "place", 2, 9, 0),  # mistake
    mv(4, 18000, "place", 2, 7, 1),  # correction (over the user's 9)
    mv(5, 19000, "check"),
    mv(6, 45000, "place", 3, 2, 1),  # 27 s pause after seq 4
    mv(7, 47000, "erase", 3, 0),  # correction (erases the user's 2)
    mv(8, 48000, "undo", 3, 2),  # restores 2
    mv(9, 80000, "place", 4, 8, 1),  # 35 s pause after seq 6
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
        self.assertEqual(
            m,
            {
                "time_ms": 90000,
                "first_move_ms": 13800,
                "max_pause_ms": 35000,
                "long_pauses": 2,
                "mistakes": 1,
                "corrections": 2,
                "checks": 1,
                "note_actions": 1,
            },
        )

    def test_no_places(self):
        m = compute_metrics([mv(1, 3000, "note", 1, 4)], 5000)
        self.assertEqual(
            (m["first_move_ms"], m["max_pause_ms"], m["long_pauses"], m["note_actions"]), (None, None, 0, 1)
        )

    def test_pauses(self):
        self.assertEqual(LONG_PAUSE_MS, 20000)
        self.assertEqual(
            pauses(MOVES),
            [
                {"after_seq": 4, "start_ms": 18000, "duration_ms": 27000},
                {"after_seq": 6, "start_ms": 45000, "duration_ms": 35000},
            ],
        )
        self.assertEqual(pauses(MOVES, threshold=10000)[0], {"after_seq": 0, "start_ms": 0, "duration_ms": 13800})
        self.assertEqual(len(pauses(MOVES, threshold=0)), 5)


def make_game(
    conn,
    pid,
    moves,
    mode="hardcore",
    status="solved",
    started="2026-10-30T10:00:00+00:00",
    time_ms=None,
    mistakes=0,
    limit=None,
):
    gid = conn.execute(
        "INSERT INTO games (puzzle_id, mode, mistake_limit, started_at, finished_at, status, time_ms, mistakes)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (pid, mode, limit, started, started if status != "active" else None, status, time_ms, mistakes),
    ).lastrowid
    for m in moves:
        conn.execute(
            "INSERT INTO moves (game_id, seq, t_ms, cell, value, kind, correct) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (gid, m["seq"], m["t_ms"], m["cell"], m["value"], m["kind"], m["correct"]),
        )
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
        self.assertEqual(
            (r["game"]["id"], r["game"]["givens"], r["game"]["solution"], r["game"]["level"]), (gid, P, S, "easy")
        )
        self.assertEqual(
            [(p["after_seq"], p["start_ms"], p["duration_ms"]) for p in r["pauses"]],
            [(4, 18000, 27000), (6, 45000, 35000)],
        )
        first = r["pauses"][0]
        board = replay(P, MOVES, upto_seq=4)
        self.assertEqual(first["board"], to_str(board))
        self.assertEqual((first["had_errors"], first["wrong_cells"]), (False, []))
        self.assert_steps_ok(first, board)

    def test_review_steps_are_distinct_moves(self):
        gid = make_game(self.conn, self.pid, [mv(1, 30000, "place", 1, 4, 1)])
        steps = review(self.conn, gid)["pauses"][0]["steps"]
        moves = [(s["cell"], s["value"]) for s in steps]
        self.assertEqual(len(moves), len(set(moves)))
        self.assertEqual(len(steps), 6)  # the start position of L1-1 has more than 6 distinct singles

    def test_review_with_errors_and_start_pause(self):
        moves = [mv(1, 25000, "place", 2, 9, 0), mv(2, 60000, "place", 1, 4, 1)]
        gid = make_game(self.conn, self.pid, moves)
        r = review(self.conn, gid)
        self.assertEqual(len(r["pauses"]), 2)
        start, second = r["pauses"]
        self.assertEqual(
            (start["after_seq"], start["duration_ms"], start["board"], start["had_errors"]), (0, 25000, P, False)
        )
        self.assert_steps_ok(start, parse(P))
        self.assertEqual(
            (second["after_seq"], second["duration_ms"], second["had_errors"], second["wrong_cells"]),
            (1, 35000, True, [2]),
        )
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
        did = c.execute(
            "INSERT INTO drills (technique, kind, puzzle_id, board, answers) VALUES"
            " ('naked_single', 'place', ?, ?, '[]')",
            (easy, P),
        ).lastrowid
        for t, ok in ((3000, 1), (5000, 1), (1000, 0)):
            c.execute(
                "INSERT INTO drill_attempts (drill_id, at, time_ms, correct) VALUES (?, ?, ?, ?)", (did, d2, t, ok)
            )
        c.commit()

    def test_by_level_mode(self):
        s = stats(self.conn)
        self.assertEqual(
            s["by_level_mode"],
            [
                {
                    "level": "easy",
                    "mode": "original",
                    "n": 4,
                    "solved": 3,
                    "median_ms": 200000,
                    "best_ms": 100000,
                    "mistakes_per_game": 1.5,
                    "fail_rate": 0.25,
                },
                {
                    "level": "medium",
                    "mode": "hardcore",
                    "n": 1,
                    "solved": 1,
                    "median_ms": 300000,
                    "best_ms": 300000,
                    "mistakes_per_game": 4.0,
                    "fail_rate": 0.0,
                },
            ],
        )

    def test_records(self):
        rec = records(self.conn)
        self.assertEqual(
            [(r["level"], r["mode"]) for r in rec],
            [(lv, md) for lv in ("easy", "medium", "hard", "expert") for md in ("original", "hardcore")],
        )
        easy_orig = rec[0]
        first = self.conn.execute("SELECT id FROM games WHERE time_ms = 100000").fetchone()[0]
        self.assertEqual(
            easy_orig,
            {
                "level": "easy",
                "mode": "original",
                "best_ms": 100000,
                "game_id": first,
                "at": "2026-10-29T09:00:00+00:00",
                "solved": 3,
            },
        )
        self.assertEqual((rec[3]["best_ms"], rec[3]["solved"]), (300000, 1))  # medium hardcore
        self.assertEqual(
            rec[2], {"level": "medium", "mode": "original", "best_ms": None, "game_id": None, "at": None, "solved": 0}
        )  # failed/abandoned/active games never count

    def test_records_ignore_games_with_checks(self):
        easy = self.conn.execute("SELECT id FROM puzzles WHERE bank_id = 'e1'").fetchone()[0]
        checked = make_game(self.conn, easy, [], "original", "solved", "2026-10-31T09:00:00+00:00", 50000, 0, 3)
        self.conn.execute("UPDATE games SET checks = 2 WHERE id = ?", (checked,))
        self.conn.commit()
        rec = records(self.conn)[0]
        self.assertEqual((rec["best_ms"], rec["solved"]), (100000, 3))  # the faster checked game is not a record
        self.assertNotEqual(rec["game_id"], checked)

    def test_records_tie_keeps_the_first(self):
        easy = self.conn.execute("SELECT id FROM puzzles WHERE bank_id = 'e1'").fetchone()[0]
        later = make_game(self.conn, easy, [], "original", "solved", "2026-10-31T09:00:00+00:00", 100000, 0, 3)
        self.assertNotEqual(records(self.conn)[0]["game_id"], later)

    def test_daily(self):
        self.assertEqual(
            stats(self.conn)["daily"],
            [
                {"day": "2026-10-29", "level": "easy", "mode": "original", "n": 2, "solved": 2, "median_ms": 150000},
                {"day": "2026-10-30", "level": "easy", "mode": "original", "n": 2, "solved": 1, "median_ms": 400000},
                {"day": "2026-10-30", "level": "medium", "mode": "hardcore", "n": 1, "solved": 1, "median_ms": 300000},
            ],
        )

    def test_techniques(self):
        techs = stats(self.conn)["techniques"]
        self.assertEqual([t["technique"] for t in techs], list(TECH_TIER))
        ns = techs[0]
        self.assertEqual(ns["title"], TECH_TITLE["naked_single"])
        self.assertEqual((ns["n"], ns["median_ms"], ns["kind"], ns["tier"]), (3, 4000, "place", 1))
        self.assertAlmostEqual(ns["accuracy"], 2 / 3)
        self.assertEqual(
            (techs[4]["technique"], techs[4]["n"], techs[4]["median_ms"], techs[4]["accuracy"]),
            ("pointing", 0, None, None),
        )

    def test_empty(self):
        s = stats(connect(":memory:"))
        self.assertEqual((s["by_level_mode"], s["daily"]), ([], []))


class ActivityTest(unittest.TestCase):
    def setUp(self):
        self.conn = connect(":memory:")
        self.pid = insert_puzzle(self.conn, "e1", "easy", P, S)
        self.did = self.conn.execute(
            "INSERT INTO drills (technique, kind, puzzle_id, board, answers) VALUES"
            " ('naked_single', 'place', ?, ?, '[]')",
            (self.pid, P),
        ).lastrowid
        self.conn.commit()

    def game(self, day, status="solved"):
        make_game(self.conn, self.pid, [], "hardcore", status, f"{day}T12:00:00+00:00", 100000)

    def attempt(self, day, correct=1, hint=0, valid_other=0):
        self.conn.execute(
            "INSERT INTO drill_attempts (drill_id, at, time_ms, correct, hint, valid_other)"
            " VALUES (?, ?, 1000, ?, ?, ?)",
            (self.did, f"{day}T12:00:00+00:00", correct, hint, valid_other),
        )
        self.conn.commit()

    def test_points(self):
        self.game("2026-10-31")
        self.game("2026-10-31", "failed")
        self.game("2026-10-31", "abandoned")
        self.attempt("2026-10-31")
        self.attempt("2026-10-31", correct=0)
        self.attempt("2026-10-31", hint=1)
        self.attempt("2026-10-31", correct=0, valid_other=1)
        a = activity(self.conn, today="2026-11-01")
        self.assertEqual(a["today"], "2026-11-01")
        self.assertEqual(a["days"], [{"day": "2026-10-31", "games": 1, "drills": 1}])
        self.assertEqual(a["totals"], {"games": 1, "drills": 1, "active_days": 1})

    def test_streak_alive_until_day_ends(self):
        for d in ("2026-10-25", "2026-10-26", "2026-10-29", "2026-10-30", "2026-10-31"):
            self.game(d)
        self.assertEqual(activity(self.conn, today="2026-11-01")["streak"], {"current": 3, "best": 3, "today": False})
        self.attempt("2026-11-01")
        self.assertEqual(activity(self.conn, today="2026-11-01")["streak"], {"current": 4, "best": 4, "today": True})
        self.assertEqual(activity(self.conn, today="2026-11-02")["streak"]["current"], 4)
        self.assertEqual(activity(self.conn, today="2026-11-03")["streak"], {"current": 0, "best": 4, "today": False})

    def test_best_from_old_history_and_window(self):
        for d in ("2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"):
            self.game(d)
        for d in ("2025-10-26", "2025-10-27", "2025-11-01", "2025-11-02"):
            self.game(d)
        a = activity(self.conn, today="2026-11-01")  # Sunday; the window starts Monday 2025-10-27
        self.assertEqual(a["streak"], {"current": 0, "best": 5, "today": False})
        self.assertEqual([d["day"] for d in a["days"]], ["2025-10-27", "2025-11-01", "2025-11-02"])
        self.assertEqual(a["totals"]["active_days"], 1)  # the last 365 days are 2025-11-02 … 2026-11-01

    def test_empty(self):
        self.assertEqual(
            activity(self.conn, today="2026-11-01"),
            {
                "today": "2026-11-01",
                "days": [],
                "streak": {"current": 0, "best": 0, "today": False},
                "totals": {"games": 0, "drills": 0, "active_days": 0},
            },
        )
        self.assertRegex(activity(self.conn)["today"], r"^\d{4}-\d{2}-\d{2}$")


if __name__ == "__main__":
    unittest.main()
