import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fixtures import L1, L2, L3
from hints import SOLUTION, _step_levels, masks, next_ladder, position_issues, solve_line
from sudoku_core import TECH_TIER, candidates, easiest_steps, find_steps, parse, solve, to_str

INKALA = "800000000003600000070090200050007000000045700000100030001000068008500010090000400"  # grade 5: beyond Y-Wing
INKALA_SOL = to_str(solve(parse(INKALA)))
TIER1 = [t for t, k in TECH_TIER.items() if k == 1]
ORDER = ["hidden_single_box", "hidden_single_row", "hidden_single_col", "naked_single"]


def singles_done(givens):
    """The board after every single in turn (fresh candidates each time): where a grade-2+ puzzle needs more."""
    g = parse(givens)
    while steps := find_steps(g, None, TIER1):
        g[steps[0].cell] = steps[0].value
    return g


def replay_line(board, line):
    g = board[:]
    for s in line["steps"]:
        if s["cell"] is not None:
            g[s["cell"]] = s["value"]
    return to_str(g)


def empties(givens):
    return [i for i, c in enumerate(givens) if c == "0"]


class IssuesTest(unittest.TestCase):
    def test_wrong_digit_and_bad_note(self):
        _, gv, sol = L1[0]
        g, e = parse(gv), empties(gv)
        g[e[0]] = int(sol[e[0]]) % 9 + 1
        notes = [0] * 81
        notes[e[1]] = 0b1111111110 & ~(1 << int(sol[e[1]]))  # every digit but the right one
        notes[e[2]] = 1 << int(sol[e[2]])
        self.assertEqual(
            position_issues(gv, sol, g, notes), {"wrong_cells": [e[0]], "bad_notes": [[e[1], int(sol[e[1]])]]}
        )
        self.assertEqual(position_issues(gv, sol, parse(gv)), {"wrong_cells": [], "bad_notes": []})


class LadderTest(unittest.TestCase):
    def test_board_error_comes_first(self):
        _, gv, sol = L1[0]
        g, e = parse(gv), empties(gv)
        g[e[0]] = int(sol[e[0]]) % 9 + 1
        notes = [0] * 81
        notes[e[1]] = 1 << (int(sol[e[1]]) % 9 + 1)
        lad = next_ladder(gv, sol, g, notes)
        self.assertEqual((lad["kind"], lad["max_level"], lad["technique"]), ("error", 2, None))
        self.assertEqual(lad["levels"][1]["cells"], [e[0]])

    def test_notes_error_next(self):
        _, gv, sol = L1[0]
        e = empties(gv)
        notes = [0] * 81
        notes[e[1]] = 1 << (int(sol[e[1]]) % 9 + 1)
        lad = next_ladder(gv, sol, parse(gv), notes)
        self.assertEqual((lad["kind"], lad["max_level"]), ("notes", 2))
        self.assertEqual(lad["levels"][1]["cells"], [e[1]])

    def test_tier1_order_on_every_fixture(self):
        for name, gv, sol in L1 + L2 + L3:
            lad = next_ladder(gv, sol, parse(gv))
            found = {s.technique for s in easiest_steps(parse(gv))}
            self.assertEqual(lad["technique"], min(found, key=ORDER.index), name)

    def test_hidden_single_levels(self):
        _, gv, sol = L1[0]
        lad = next_ladder(gv, sol, parse(gv))
        self.assertEqual(
            (lad["kind"], lad["technique"], lad["theory"], lad["max_level"]),
            ("step", "hidden_single_box", "hidden-single", 4),
        )
        l1, l2, l3, l4 = lad["levels"]
        self.assertTrue(l1["text"].startswith("Следующий ход: "))
        self.assertIsNotNone(l2["unit"])
        self.assertEqual((l3["unit"], l3["place"]), (l2["unit"], None))  # L3 names the digit, not the cell
        cell, v = l4["place"]
        self.assertEqual((v, l3["digit"], l4["unit"]), (int(sol[cell]), v, l2["unit"]))

    def test_naked_single_levels(self):
        _, gv, sol = L1[0]
        g = parse(sol)
        g[empties(gv)[0]] = 0  # one hole in the solved grid: a naked single
        cands = candidates(g)
        (s,) = find_steps(g, cands, ["naked_single"])
        _, _, l3, l4 = _step_levels(s, cands, None)
        self.assertEqual((l3["cells"], l3["place"]), ([s.cell], None))  # L3 names the cell, not the digit
        self.assertEqual(l4["place"], [s.cell, int(sol[s.cell])])

    def test_pointing_levels_and_what_it_gives(self):
        _, gv, sol = L2[0]
        g = singles_done(gv)
        lad = next_ladder(gv, sol, g)
        self.assertEqual((lad["kind"], lad["technique"], lad["theory"]), ("step", "pointing", "pointing-claiming"))
        l3, l4 = lad["levels"][2], lad["levels"][3]
        cands = candidates(g)
        self.assertTrue(l3["cells"] and l4["elims"] and l4["place"] is None)
        self.assertTrue(all(v == l3["digit"] and v in cands[c] for c, v in l4["elims"]))
        r, c, v = map(int, re.search(r"Это даёт: r(\d)c(\d) = (\d)", l4["text"]).groups())
        self.assertEqual(int(sol[(r - 1) * 9 + c - 1]), v)

    def test_eliminations_already_in_the_notes_are_skipped(self):
        _, gv, sol = L2[0]
        g = singles_done(gv)
        first = next_ladder(gv, sol, g)
        notes = masks(candidates(g))
        for c, v in first["levels"][3]["elims"]:
            notes[c] &= ~(1 << v)
        lad = next_ladder(gv, sol, g, notes)
        self.assertEqual(TECH_TIER[lad["technique"]], 1)
        cell, v = lad["levels"][3]["place"]
        self.assertEqual(int(sol[cell]), v)

    def test_branch_cands_that_drop_a_solution_digit_are_ignored(self):
        _, gv, sol = L1[0]
        g = parse(gv)
        cands = masks(candidates(g))
        e = empties(gv)[0]
        cands[e] &= ~(1 << int(sol[e]))
        self.assertEqual(next_ladder(gv, sol, g, cands=cands), next_ladder(gv, sol, g))

    def test_stuck_and_solved(self):
        lad = next_ladder(INKALA, INKALA_SOL, parse(INKALA))
        self.assertEqual((lad["kind"], lad["max_level"], lad["technique"]), ("stuck", 2, None))
        cell, v = lad["levels"][1]["place"]
        self.assertEqual(int(INKALA_SOL[cell]), v)
        _, gv, sol = L1[0]
        self.assertEqual(next_ladder(gv, sol, parse(sol))["kind"], "solved")


class LineTest(unittest.TestCase):
    def test_fixtures_solve_by_logic(self):
        for name, gv, sol in L1 + L2 + L3:
            line = solve_line(gv, sol, parse(gv))
            self.assertTrue(line["solved"], name)
            self.assertEqual(replay_line(parse(gv), line), sol, name)
            self.assertFalse([s for s in line["steps"] if s["technique"] == SOLUTION], name)
            self.assertTrue(all(len(s["cands"]) == 81 and s["explanation"] for s in line["steps"]), name)

    def test_beyond_the_core_takes_digits_from_the_solution(self):
        line = solve_line(INKALA, INKALA_SOL, parse(INKALA))
        self.assertTrue(line["solved"])
        self.assertEqual(replay_line(parse(INKALA), line), INKALA_SOL)
        self.assertTrue([s for s in line["steps"] if s["technique"] == SOLUTION])

    def test_wrong_digits_taken_off_first(self):
        _, gv, sol = L1[0]
        g, e = parse(gv), empties(gv)
        g[e[0]] = int(sol[e[0]]) % 9 + 1
        line = solve_line(gv, sol, g)
        self.assertEqual(line["wrong_cells"], [e[0]])
        self.assertEqual(replay_line(g, line), sol)

    def test_branch_cands_keep_eliminations(self):
        _, gv, sol = L2[0]
        g = singles_done(gv)
        first = solve_line(gv, sol, g)["steps"][0]
        self.assertIsNone(first["cell"])
        after = first["cands"][:]
        for c, v in first["eliminations"]:
            after[c] &= ~(1 << v)
        self.assertNotEqual(solve_line(gv, sol, g, after)["steps"][0]["eliminations"], first["eliminations"])


if __name__ == "__main__":
    unittest.main()
