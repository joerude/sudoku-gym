import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import connect
from drills import (
    DRILL_PROMPT,
    DRILL_TECHNIQUES,
    KIND,
    UNLOCK_MIN_CORRECT,
    attempt,
    explain,
    hint,
    make_drills,
    next_drill,
    reveal,
    technique_list,
    unlocked_tier,
)
from fixtures import L2, L3, seed_variants
from sudoku_core import TECH_TIER, TECH_TITLE, candidates, find_steps, parse

ELIM = [t for t in DRILL_TECHNIQUES if KIND[t] == "eliminate"]
PLACE = [t for t in DRILL_TECHNIQUES if KIND[t] == "place"]


def seeded_conn():
    conn = connect(":memory:")
    levels = {}
    for pid in seed_variants(conn, 12, seed=11, level="easy"):
        levels[pid] = "easy"
    for pid in seed_variants(conn, 12, seed=12, level="medium", base=L2, tech_grade=2):
        levels[pid] = "medium"
    for pid in seed_variants(conn, 12, seed=13, level="hard", base=L3, tech_grade=3):
        levels[pid] = "hard"
    for pid in seed_variants(conn, 6, seed=14, level="expert", base=L3, tech_grade=3):
        levels[pid] = "expert"
    return conn, levels


def add_attempts(conn, technique, times_correct, n_wrong=0):
    drill_id = conn.execute("SELECT id FROM drills WHERE technique=? LIMIT 1", (technique,)).fetchone()[0]
    for t in times_correct:
        conn.execute(
            "INSERT INTO drill_attempts (drill_id, at, time_ms, correct) VALUES (?, '2026-10-30T10:00:00+00:00', ?, 1)",
            (drill_id, t),
        )
    for _ in range(n_wrong):
        conn.execute(
            "INSERT INTO drill_attempts (drill_id, at, time_ms, correct)"
            " VALUES (?, '2026-10-30T10:00:00+00:00', 999, 0)",
            (drill_id,),
        )
    conn.commit()


def sub(d, keys):
    return {k: d[k] for k in keys}


class ConstantsTest(unittest.TestCase):
    def test_techniques_and_kinds(self):
        self.assertEqual(DRILL_TECHNIQUES, list(TECH_TIER))
        self.assertEqual(len(DRILL_TECHNIQUES), 10)
        self.assertEqual(PLACE, ["naked_single", "hidden_single_box", "hidden_single_row", "hidden_single_col"])
        self.assertEqual(KIND["pointing"], "eliminate")
        self.assertEqual(KIND["y_wing"], "eliminate")

    def test_prompts(self):
        self.assertEqual(set(DRILL_PROMPT), set(DRILL_TECHNIQUES))
        self.assertIn("naked single", DRILL_PROMPT["naked_single"])
        self.assertIn("в блоке", DRILL_PROMPT["hidden_single_box"])
        self.assertIn("в строке", DRILL_PROMPT["hidden_single_row"])
        self.assertIn("в столбце", DRILL_PROMPT["hidden_single_col"])
        self.assertEqual(DRILL_PROMPT["pointing"], "Найди кандидата, которого убирает указывающая пара (pointing)")
        self.assertIn("X-Wing", DRILL_PROMPT["x_wing"])


class MakeDrillsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn, cls.levels = seeded_conn()
        cls.made = make_drills(cls.conn, per_technique=5, seed=1)
        cls.rows = cls.conn.execute(
            "SELECT d.*, p.givens, p.solution FROM drills d JOIN puzzles p ON p.id = d.puzzle_id"
        ).fetchall()

    def test_count_and_caps(self):
        self.assertEqual(self.made, len(self.rows))
        per = dict.fromkeys(DRILL_TECHNIQUES, 0)
        for r in self.rows:
            per[r["technique"]] += 1
            self.assertEqual(r["kind"], KIND[r["technique"]])
        for t in PLACE + ["pointing", "claiming", "naked_pair", "hidden_pair"]:
            self.assertEqual(per[t], 5, t)
        for t in DRILL_TECHNIQUES:
            self.assertLessEqual(per[t], 5, t)

    def test_levels(self):
        for r in self.rows:
            level = self.levels[r["puzzle_id"]]
            if r["kind"] == "place":
                self.assertIn(level, ("easy", "medium"))
            elif level == "expert":
                self.assertEqual(TECH_TIER[r["technique"]], 4)
            else:
                self.assertIn(level, ("medium", "hard"))

    def test_board_is_partial_solution(self):
        for r in self.rows:
            board, sol, givens = r["board"], r["solution"], r["givens"]
            for i in range(81):
                if givens[i] != "0":
                    self.assertEqual(board[i], givens[i])
                if board[i] != "0":
                    self.assertEqual(board[i], sol[i])

    def test_place_answers(self):
        rows = [r for r in self.rows if r["kind"] == "place"]
        self.assertTrue(rows)
        for r in rows:
            board, sol, givens = r["board"], r["solution"], r["givens"]
            answers = json.loads(r["answers"])
            self.assertTrue(1 <= len(answers) <= 3, answers)
            for cell, value in answers:
                self.assertEqual(board[cell], "0")
                self.assertEqual(int(sol[cell]), value)
            steps = find_steps(parse(board), techniques=[r["technique"]])
            self.assertEqual({(s.cell, s.value) for s in steps}, {tuple(a) for a in answers})
            empty0 = givens.count("0")
            filled = empty0 - board.count("0")
            self.assertGreaterEqual(filled, 0.2 * empty0 - 1)
            self.assertLessEqual(filled, 0.8 * empty0 + 1)

    def test_eliminate_answers(self):
        rows = [r for r in self.rows if r["kind"] == "eliminate"]
        self.assertTrue(rows)
        for r in rows:
            g, sol = parse(r["board"]), r["solution"]
            fresh = candidates(g)
            answers = json.loads(r["answers"])
            self.assertEqual(len(answers), len({tuple(a) for a in answers}))
            self.assertGreaterEqual(len(answers), 1)
            for cell, value in answers:
                self.assertIn(value, fresh[cell])
                self.assertNotEqual(int(sol[cell]), value)
            steps = find_steps(g, fresh, [r["technique"]])
            self.assertTrue(1 <= len(steps) <= 3, steps)
            self.assertEqual({(c, v) for s in steps for c, v in s.eliminations}, {tuple(a) for a in answers})
            # the position is stuck on singles
            self.assertEqual(find_steps(g, fresh, PLACE), [])

    def test_deterministic(self):
        conn2, _ = seeded_conn()
        make_drills(conn2, per_technique=5, seed=1)
        a = [(r["technique"], r["board"], r["answers"]) for r in self.conn.execute("SELECT * FROM drills ORDER BY id")]
        b = [(r["technique"], r["board"], r["answers"]) for r in conn2.execute("SELECT * FROM drills ORDER BY id")]
        self.assertEqual(a, b)

    def test_tops_up_only_missing(self):
        conn2, _ = seeded_conn()
        first = make_drills(conn2, per_technique=2, seed=1)
        n = conn2.execute("SELECT COUNT(*) FROM drills").fetchone()[0]
        self.assertEqual(first, n)
        self.assertGreaterEqual(n, 16)
        self.assertEqual(make_drills(conn2, per_technique=2, seed=1), 0)
        self.assertEqual(conn2.execute("SELECT COUNT(*) FROM drills").fetchone()[0], n)

    def test_technique_list(self):
        lst = technique_list(self.conn)
        self.assertEqual([x["technique"] for x in lst], DRILL_TECHNIQUES)
        ns = next(x for x in lst if x["technique"] == "naked_single")
        self.assertEqual(
            ns,
            {
                "technique": "naked_single",
                "title": TECH_TITLE["naked_single"],
                "kind": "place",
                "tier": 1,
                "n": 5,
                "unlocked": True,
                "theory": "naked-single",
                "correct": 0,
                "accuracy": None,
                "mastered": False,
            },
        )
        self.assertEqual(next(x for x in lst if x["technique"] == "pointing")["kind"], "eliminate")
        self.assertEqual(technique_list(connect(":memory:"))[0]["n"], 0)


class AttemptTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn, _ = seeded_conn()
        make_drills(cls.conn, per_technique=3, seed=1)

    def setUp(self):
        self.conn.execute("DELETE FROM drill_attempts")

    def drill(self, technique):
        d = self.conn.execute(
            "SELECT d.*, p.solution FROM drills d JOIN puzzles p ON p.id=d.puzzle_id WHERE technique=? LIMIT 1",
            (technique,),
        ).fetchone()
        return d, json.loads(d["answers"])

    def test_correct(self):
        d, answers = self.drill("hidden_single_box")
        cell, value = answers[0]
        res = attempt(self.conn, d["id"], 4200, cell, value)
        self.assertEqual(
            sub(res, ("correct", "valid_other_move", "answers")),
            {"correct": True, "valid_other_move": False, "answers": answers},
        )
        row = self.conn.execute("SELECT * FROM drill_attempts").fetchone()
        self.assertEqual(
            (row["drill_id"], row["time_ms"], row["correct"], row["cell"], row["value"]),
            (d["id"], 4200, 1, cell, value),
        )

    def test_wrong_value(self):
        d, answers = self.drill("hidden_single_box")
        cell, value = answers[0]
        res = attempt(self.conn, d["id"], 1000, cell, value % 9 + 1)
        self.assertFalse(res["correct"])
        self.assertFalse(res["valid_other_move"])
        self.assertEqual(self.conn.execute("SELECT correct FROM drill_attempts").fetchone()[0], 0)

    def test_place_valid_other_move(self):
        d, answers = self.drill("hidden_single_box")
        board, sol = d["board"], d["solution"]
        answer_cells = {c for c, _ in answers}
        other = next(i for i in range(81) if board[i] == "0" and i not in answer_cells)
        res = attempt(self.conn, d["id"], 1000, other, int(sol[other]))
        self.assertEqual((res["correct"], res["valid_other_move"]), (False, True))
        filled = next(i for i in range(81) if board[i] != "0")
        self.assertFalse(attempt(self.conn, d["id"], 1000, filled, int(sol[filled]))["valid_other_move"])

    def test_eliminate(self):
        d, answers = self.drill("pointing")
        board, sol = d["board"], d["solution"]
        fresh = candidates(parse(board))
        cell, value = answers[0]
        self.assertEqual(
            sub(attempt(self.conn, d["id"], 5000, cell, value), ("correct", "valid_other_move", "answers")),
            {"correct": True, "valid_other_move": False, "answers": answers},
        )
        # the cell's solution digit is never a valid elimination
        self.assertEqual(attempt(self.conn, d["id"], 5000, cell, int(sol[cell]))["valid_other_move"], False)
        # another removable (wrong) candidate elsewhere is a valid other move
        other = next((i, v) for i in range(81) for v in sorted(fresh[i]) if v != int(sol[i]) and [i, v] not in answers)
        res = attempt(self.conn, d["id"], 5000, *other)
        self.assertEqual((res["correct"], res["valid_other_move"]), (False, True))
        # a digit that is not a candidate is not
        cell2 = next(i for i in range(81) if board[i] == "0" and len(fresh[i]) < 9)
        non_cand = next(v for v in range(1, 10) if v not in fresh[cell2])
        self.assertFalse(attempt(self.conn, d["id"], 5000, cell2, non_cand)["valid_other_move"])

    def test_unknown_drill(self):
        self.assertIsNone(attempt(self.conn, 99999, 1000, 0, 1))


class NextDrillTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn, _ = seeded_conn()
        make_drills(cls.conn, per_technique=3, seed=1)

    def setUp(self):
        self.conn.execute("DELETE FROM drill_attempts")

    def test_empty_db(self):
        self.assertIsNone(next_drill(connect(":memory:")))
        self.assertIsNone(next_drill(connect(":memory:"), "random"))

    def test_explicit_technique(self):
        d = next_drill(self.conn, "hidden_single_col")
        self.assertEqual(set(d), {"id", "technique", "kind", "prompt", "title", "board", "candidates", "fav"})
        self.assertEqual((d["technique"], d["kind"]), ("hidden_single_col", "place"))
        self.assertEqual(d["prompt"], DRILL_PROMPT["hidden_single_col"])
        self.assertEqual(d["title"], TECH_TITLE["hidden_single_col"])
        self.assertEqual(len(d["board"]), 81)
        self.assertEqual(d["candidates"], [sorted(c) for c in candidates(parse(d["board"]))])
        e = next_drill(self.conn, "naked_pair")
        self.assertEqual((e["technique"], e["kind"]), ("naked_pair", "eliminate"))
        with self.assertRaises(ValueError):
            next_drill(self.conn, "swordfish")

    def test_random_only_unlocked(self):
        seen = {next_drill(self.conn, "random")["technique"] for _ in range(100)}
        self.assertEqual(seen, set(PLACE))  # only tier 1 is open at the start
        self.master(PLACE)
        seen = {next_drill(self.conn, "random")["technique"] for _ in range(200)}
        self.assertTrue(seen & {"pointing", "claiming"})
        self.assertFalse(seen & {"x_wing", "y_wing", "naked_pair", "hidden_pair"})

    def master(self, techniques):
        for t in techniques:
            add_attempts(self.conn, t, [3000] * UNLOCK_MIN_CORRECT)

    def test_unlocking(self):
        self.assertEqual(unlocked_tier(self.conn), 1)
        self.assertEqual(next_drill(self.conn, "x_wing")["technique"], "x_wing")  # explicit choice always works
        self.master(PLACE[:-1])
        self.assertEqual(unlocked_tier(self.conn), 1)
        self.master(PLACE[-1:])
        self.assertEqual(unlocked_tier(self.conn), 2)
        add_attempts(self.conn, "pointing", [3000] * UNLOCK_MIN_CORRECT, n_wrong=10)  # accuracy too low
        add_attempts(self.conn, "claiming", [3000] * UNLOCK_MIN_CORRECT)
        self.assertEqual(unlocked_tier(self.conn), 2)
        rows = {r["technique"]: r for r in technique_list(self.conn)}
        self.assertTrue(rows["claiming"]["unlocked"] and rows["claiming"]["mastered"])
        self.assertFalse(rows["pointing"]["mastered"])
        self.assertFalse(rows["naked_pair"]["unlocked"])
        self.assertEqual(rows["pointing"]["theory"], "pointing-claiming")

    def test_valid_other_move_is_neutral(self):
        d = next_drill(self.conn, "hidden_single_col")
        board = parse(d["board"])
        sol = self.conn.execute(
            "SELECT p.solution FROM drills d JOIN puzzles p ON p.id = d.puzzle_id WHERE d.id = ?", (d["id"],)
        ).fetchone()[0]
        answers = {
            tuple(a)
            for a in json.loads(self.conn.execute("SELECT answers FROM drills WHERE id = ?", (d["id"],)).fetchone()[0])
        }
        other = next(i for i in range(81) if not board[i] and (i, int(sol[i])) not in answers)
        r = attempt(self.conn, d["id"], 4000, other, int(sol[other]))
        self.assertEqual((r["correct"], r["valid_other_move"]), (False, True))
        self.assertEqual(self.conn.execute("SELECT valid_other FROM drill_attempts").fetchone()[0], 1)
        m = next(x for x in technique_list(self.conn) if x["technique"] == "hidden_single_col")
        self.assertEqual((m["correct"], m["accuracy"]), (0, None))  # not counted as an error

    def test_adaptive_never_picks_locked(self):
        for _ in range(30):
            self.assertIn(next_drill(self.conn)["technique"], PLACE)

    def test_adaptive_untried_first(self):
        self.assertEqual(next_drill(self.conn)["technique"], "naked_single")
        add_attempts(self.conn, "naked_single", [2000])
        self.assertEqual(next_drill(self.conn)["technique"], "hidden_single_box")

    def tried_all(self, worst, times, n_wrong=0):
        for t in {r[0] for r in self.conn.execute("SELECT DISTINCT technique FROM drills")}:
            if t == worst:
                add_attempts(self.conn, t, times, n_wrong)
            else:
                add_attempts(self.conn, t, [3000] * UNLOCK_MIN_CORRECT)

    def test_adaptive_slowest_median(self):
        self.tried_all("hidden_single_row", [9000, 8000, 1000])
        self.assertEqual(next_drill(self.conn)["technique"], "hidden_single_row")

    def test_adaptive_error_weight(self):
        # claiming: median 2500 but 50% errors -> 3750 > others' 3000
        self.tried_all("claiming", [2500, 2500], n_wrong=2)
        self.assertEqual(next_drill(self.conn)["technique"], "claiming")

    def test_excludes_recently_attempted(self):
        ids = [r[0] for r in self.conn.execute("SELECT id FROM drills WHERE technique='naked_single'")]
        self.assertGreaterEqual(len(ids), 2)
        attempt(self.conn, ids[0], 1000, 0, 1)
        for _ in range(20):
            self.assertNotEqual(next_drill(self.conn, "naked_single")["id"], ids[0])
        for i in ids[1:]:
            attempt(self.conn, i, 1000, 0, 1)
        # every drill is recent -> still returns one, the least recently attempted
        self.assertEqual(next_drill(self.conn, "naked_single")["id"], ids[0])


class ExplainTest(unittest.TestCase):
    BOARD = "500417329123659784794000156000000012971060843200801007007120008409000201812903005"

    def test_pointing_from_real_drill(self):
        e = explain(self.BOARD, "pointing", [[28, 5], [46, 5]])
        self.assertEqual(
            e["explanation"],
            "В блоке 7 цифра 5 может стоять только в столбце 2 (r7c2, r8c2). "
            "Значит, в этом столбце вне блока 5 быть не может → убираем 5 из r4c2, r6c2.",
        )
        self.assertEqual(e["pattern"], [55, 64])

    def test_every_technique_explains(self):
        conn, _ = seeded_conn()
        make_drills(conn, per_technique=3, seed=5)
        for t, board, answers in conn.execute("SELECT technique, board, answers FROM drills"):
            e = explain(board, t, json.loads(answers))
            self.assertTrue(e["explanation"], t)
            self.assertTrue(e["pattern"], t)

    def test_attempt_returns_explanation(self):
        conn, _ = seeded_conn()
        make_drills(conn, per_technique=2, seed=5)
        did, answers = conn.execute("SELECT id, answers FROM drills WHERE technique='pointing'").fetchone()
        c, v = json.loads(answers)[0]
        r = attempt(conn, did, 1000, c, v)
        self.assertTrue(r["correct"])
        self.assertIn("убираем", r["explanation"])
        self.assertEqual(r["theory"], "pointing-claiming")


class HintTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn, _ = seeded_conn()
        make_drills(cls.conn, per_technique=3, seed=5)

    def setUp(self):
        self.conn.execute("DELETE FROM drill_attempts")

    def drill(self, technique):
        did, answers = self.conn.execute(
            "SELECT id, answers FROM drills WHERE technique=? LIMIT 1", (technique,)
        ).fetchone()
        return did, json.loads(answers)

    def mastery(self, technique):
        return next(x for x in technique_list(self.conn) if x["technique"] == technique)

    def test_every_technique_hints_without_giving_the_answer(self):
        for did, t, answers in self.conn.execute("SELECT id, technique, answers FROM drills").fetchall():
            h = hint(self.conn, did)
            self.assertTrue(h["hint"], t)
            self.assertNotIn("убираем", h["hint"], t)
            if KIND[t] == "place":
                for c, _ in json.loads(answers):
                    self.assertNotIn(f"r{c // 9 + 1}c{c % 9 + 1}", h["hint"], t)

    def test_where_to_look(self):
        did, answers = self.drill("hidden_single_row")
        h = hint(self.conn, did)
        self.assertEqual(h["unit"], answers[0][0] // 9)  # the row of the answer
        self.assertIsNone(h["digit"])
        did, answers = self.drill("pointing")
        h = hint(self.conn, did)
        self.assertTrue(18 <= h["unit"] <= 26)
        self.assertEqual(h["digit"], answers[0][1])
        did, answers = self.drill("x_wing")
        h = hint(self.conn, did)
        self.assertEqual((h["unit"], h["digit"]), (None, answers[0][1]))
        did, _ = self.drill("y_wing")
        self.assertEqual(len(hint(self.conn, did)["cells"]), 1)  # the pivot
        self.assertIsNone(hint(self.conn, 99999))

    def test_correct_after_hint_is_neutral(self):
        did, answers = self.drill("hidden_single_box")
        r = attempt(self.conn, did, 9000, *answers[0], hint=1)
        self.assertTrue(r["correct"])
        self.assertEqual(self.conn.execute("SELECT hint FROM drill_attempts").fetchone()[0], 1)
        m = self.mastery("hidden_single_box")
        self.assertEqual((m["correct"], m["accuracy"]), (0, None))

    def test_wrong_after_hint_is_an_error(self):
        did, answers = self.drill("hidden_single_box")
        c, v = answers[0]
        attempt(self.conn, did, 9000, c, v % 9 + 1, hint=1)
        self.assertEqual(self.mastery("hidden_single_box")["accuracy"], 0.0)

    def test_reveal(self):
        did, answers = self.drill("pointing")
        r = reveal(self.conn, did, 12000)
        self.assertEqual((r["correct"], r["answers"]), (False, answers))
        self.assertIn("убираем", r["explanation"])
        row = self.conn.execute("SELECT time_ms, correct, cell, value, hint FROM drill_attempts").fetchone()
        self.assertEqual(tuple(row), (12000, 0, None, None, 2))
        self.assertEqual(self.mastery("pointing")["accuracy"], 0.0)  # «не знаю» counts as an error
        self.assertIsNone(reveal(self.conn, 99999, 1000))


if __name__ == "__main__":
    unittest.main()
