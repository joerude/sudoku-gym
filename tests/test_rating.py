import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import rating
from db import connect
from fixtures import L1, insert_puzzle

DAY1 = "2026-10-30T12:00:00+00:00"
DAY2 = "2026-10-31T12:00:00+00:00"


def conn_with_drills():
    conn = connect(":memory:")
    name, g, s = L1[0]
    pid = insert_puzzle(conn, name, "easy", g, s)
    ids = {
        t: conn.execute(
            "INSERT INTO drills (technique, puzzle_id, board, answers) VALUES (?, ?, ?, '[]')", (t, pid, g)
        ).lastrowid
        for t in ("naked_single", "pointing")
    }
    conn.commit()
    return conn, ids


def add(conn, drill_id, time_ms, correct=1, hint=0, valid_other=0, rated=1, at=DAY1):
    cur = conn.execute(
        "INSERT INTO drill_attempts (drill_id, at, time_ms, correct, hint, valid_other, rated)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (drill_id, at, time_ms, correct, hint, valid_other, rated),
    )
    conn.commit()
    return cur.lastrowid


def calibrated(norm_ms=1000):
    """naked_single frozen at norm_ms by ten correct answers; pointing has no history."""
    conn, ids = conn_with_drills()
    for _ in range(rating.NORM_MIN_CORRECT):
        add(conn, ids["naked_single"], norm_ms)
    rating.freeze_norms(conn)
    return conn, ids


class ScoreTest(unittest.TestCase):
    def test_score(self):
        self.assertAlmostEqual(rating.score(1000, 1000, True), 0.5)
        self.assertAlmostEqual(rating.score(500, 1000, True), 0.8)
        self.assertAlmostEqual(rating.score(2000, 1000, True), 0.2)
        self.assertEqual(rating.score(500, 1000, False), 0.0)

    def test_expected(self):
        self.assertAlmostEqual(rating.expected(1500), 0.5)
        self.assertGreater(rating.expected(1600), 0.5)


class FreezeTest(unittest.TestCase):
    def test_freezes_on_the_tenth_correct_answer_and_never_again(self):
        conn, ids = conn_with_drills()
        d = ids["naked_single"]
        for t in range(1000, 1009):
            add(conn, d, t)
        add(conn, d, 1, correct=1, hint=1)  # after a hint: does not count towards the norm
        add(conn, d, 9999, correct=0)
        self.assertEqual(rating.freeze_norms(conn), [])
        self.assertEqual(rating.calibrating(conn, "naked_single"), {"n": 9, "need": 10})
        last = add(conn, d, 1009)
        self.assertEqual(rating.freeze_norms(conn), ["naked_single"])
        norm, from_id = conn.execute(
            "SELECT norm_ms, from_attempt_id FROM rating_norms WHERE technique='naked_single'"
        ).fetchone()
        self.assertEqual((norm, from_id), (round((1004 + 1005) / 2), last))
        self.assertIsNone(rating.calibrating(conn, "naked_single"))
        for _ in range(10):
            add(conn, d, 100)
        self.assertEqual(rating.freeze_norms(conn), [])
        self.assertEqual(conn.execute("SELECT norm_ms FROM rating_norms").fetchone()[0], norm)

    def test_norm_is_the_median_of_the_last_ten(self):
        conn, ids = conn_with_drills()
        for t in [9000] * 5 + [1000] * 10:
            add(conn, ids["naked_single"], t)
        rating.freeze_norms(conn)
        self.assertEqual(conn.execute("SELECT norm_ms FROM rating_norms").fetchone()[0], 1000)

    def test_zero_times_freeze_a_norm_of_one(self):
        conn, ids = conn_with_drills()
        for _ in range(rating.NORM_MIN_CORRECT):
            add(conn, ids["naked_single"], 0)
        self.assertEqual(rating.freeze_norms(conn), ["naked_single"])
        self.assertEqual(conn.execute("SELECT norm_ms FROM rating_norms").fetchone()[0], 1)
        add(conn, ids["naked_single"], 500)
        self.assertEqual(len(rating.replay(conn)), 1)
        self.assertEqual(rating.current(conn)["by_technique"]["naked_single"]["norm_ms"], 1)
        self.assertLess(rating.current(conn)["rating"], rating.BASE)  # 500 ms against a 1 ms norm scores ~0


class ReplayTest(unittest.TestCase):
    def test_nothing_rated_right_after_calibration(self):
        conn, _ = calibrated()
        self.assertEqual(rating.replay(conn), [])
        self.assertEqual(rating.current(conn)["rating"], rating.BASE)

    def test_answers_at_the_norm_keep_1500(self):
        conn, ids = calibrated(1000)
        for _ in range(20):
            add(conn, ids["naked_single"], 1000)
        pts = rating.replay(conn)
        self.assertEqual(len(pts), 20)
        self.assertAlmostEqual(pts[-1]["rating"], 1500)

    def test_fast_raises_errors_lower(self):
        conn, ids = calibrated(1000)
        add(conn, ids["naked_single"], 500)
        pts = rating.replay(conn)
        self.assertAlmostEqual(pts[0]["delta"], 40 * (0.8 - 0.5))
        add(conn, ids["naked_single"], 800, correct=0)
        pts = rating.replay(conn)
        self.assertLess(pts[1]["delta"], 0)
        self.assertAlmostEqual(pts[1]["rating"], pts[0]["rating"] + pts[1]["delta"])

    def test_neutral_unrated_and_uncalibrated_are_skipped(self):
        conn, ids = calibrated(1000)
        add(conn, ids["naked_single"], 500, hint=1)  # right after «где искать»
        add(conn, ids["naked_single"], 500, correct=0, valid_other=1)  # a true move by another technique
        add(conn, ids["naked_single"], 500, rated=0)  # «Избранное»
        add(conn, ids["pointing"], 500)  # no norm yet
        self.assertEqual(rating.replay(conn), [])
        add(conn, ids["naked_single"], 500, correct=0, hint=2)  # «показать ответ» is an error
        self.assertEqual(len(rating.replay(conn)), 1)
        self.assertLess(rating.replay(conn)[0]["delta"], 0)

    def test_k_drops_after_the_provisional_attempts(self):
        conn, ids = calibrated(1000)
        for _ in range(rating.PROVISIONAL_N + 1):
            add(conn, ids["naked_single"], 500)
        pts = rating.replay(conn)
        prev = pts[-2]["rating"]
        self.assertAlmostEqual(pts[-1]["delta"], 20 * (0.8 - rating.expected(prev)))
        self.assertAlmostEqual(pts[-2]["delta"], 40 * (0.8 - rating.expected(pts[-3]["rating"])))

    def test_replay_by_technique(self):
        conn, ids = calibrated(1000)
        for _ in range(rating.NORM_MIN_CORRECT):
            add(conn, ids["pointing"], 2000)
        rating.freeze_norms(conn)
        add(conn, ids["naked_single"], 500)
        add(conn, ids["pointing"], 4000)
        self.assertEqual(len(rating.replay(conn)), 2)
        self.assertEqual([p["delta"] > 0 for p in rating.replay(conn, "pointing")], [False])


class CurrentTest(unittest.TestCase):
    def test_current_and_by_technique(self):
        conn, ids = calibrated(1000)
        add(conn, ids["naked_single"], 500)
        cur = rating.current(conn)
        self.assertEqual((cur["rating"], cur["n"], cur["provisional"]), (1512, 1, True))
        self.assertEqual(cur["by_technique"]["naked_single"], {"rating": 1512, "n": 1, "norm_ms": 1000})
        self.assertEqual(cur["by_technique"]["pointing"], {"calibrating": {"n": 0, "need": 10}})

    def test_outcome(self):
        conn, ids = calibrated(1000)
        a = add(conn, ids["naked_single"], 500)
        self.assertEqual(
            rating.outcome(conn, a, "naked_single"),
            {"rating": {"before": 1500, "after": 1512, "delta": 12, "provisional": True}, "calibrating": None},
        )
        b = add(conn, ids["naked_single"], 500, rated=0)
        self.assertEqual(rating.outcome(conn, b, "naked_single"), {"rating": None, "calibrating": None})
        c = add(conn, ids["pointing"], 500)
        self.assertEqual(rating.outcome(conn, c, "pointing"), {"rating": None, "calibrating": {"n": 1, "need": 10}})

    def test_history_is_the_last_rating_of_each_day(self):
        conn, ids = calibrated(1000)
        add(conn, ids["naked_single"], 500, at=DAY1)
        add(conn, ids["naked_single"], 500, at=DAY1)
        add(conn, ids["naked_single"], 2000, at=DAY2)
        pts = rating.replay(conn)
        self.assertEqual(
            rating.history(conn),
            [
                {"day": "2026-10-30", "rating": round(pts[1]["rating"])},
                {"day": "2026-10-31", "rating": round(pts[2]["rating"])},
            ],
        )


if __name__ == "__main__":
    unittest.main()
