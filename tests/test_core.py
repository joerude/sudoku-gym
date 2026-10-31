import unittest

from sudoku_core import (
    GRADE_TITLE, PEERS, TECH_TIER, TECH_TITLE, UNITS, count_solutions, easiest_steps, find_steps,
    grade, parse, solve, to_str, unit_name,
)

P = "100006000600035120032000000000140030860000092050029000000000370013590008000400005"
S = "147286953698735124532914867279148536861357492354629781425861379713592648986473215"
L2 = "000030607001002050502060000800090063000000000620070004000020908080600300405080000"
L3 = "000009050080030000705200001850060200020000010006050043100005304000040060070300000"


def box_of(cell):
    return 18 + (cell // 27) * 3 + (cell % 9) // 3


class ParseTest(unittest.TestCase):
    def test_roundtrip_and_dots(self):
        self.assertEqual(to_str(parse(P)), P)
        self.assertEqual(to_str(parse(P.replace("0", "."))), P)

    def test_ascii_art(self):
        rows = [P[r * 9:r * 9 + 9].replace("0", ".") for r in range(9)]
        art = []
        for r, row in enumerate(rows):
            if r in (3, 6):
                art.append("------+-------+------")
            art.append(" ".join(row[:3]) + " | " + " ".join(row[3:6]) + " | " + " ".join(row[6:]))
        self.assertEqual(to_str(parse("\n".join(art))), P)

    def test_wrong_length(self):
        with self.assertRaises(ValueError):
            parse("123")


class GeometryTest(unittest.TestCase):
    def test_units_and_peers(self):
        self.assertEqual(len(UNITS), 27)
        self.assertTrue(all(len(u) == 9 for u in UNITS))
        self.assertTrue(all(len(p) == 20 for p in PEERS))
        self.assertEqual(UNITS[18], [0, 1, 2, 9, 10, 11, 18, 19, 20])

    def test_unit_names(self):
        self.assertEqual(unit_name(0), "строка 1")
        self.assertEqual(unit_name(9), "столбец 1")
        self.assertEqual(unit_name(26), "блок 9")


class SolveTest(unittest.TestCase):
    def test_solve_and_uniqueness(self):
        self.assertEqual(to_str(solve(parse(P))), S)
        self.assertEqual(count_solutions(parse(P)), 1)
        self.assertEqual(count_solutions([0] * 81), 2)

    def test_contradiction(self):
        g = parse(P)
        g[1] = 1  # duplicate 1 in row 1
        self.assertIsNone(solve(g))
        self.assertEqual(count_solutions(g), 0)


class StepsTest(unittest.TestCase):
    def assert_steps_valid(self, puzzle):
        g, sol = parse(puzzle), solve(parse(puzzle))
        steps = find_steps(g)
        self.assertTrue(steps)
        for st in steps:
            self.assertIn(st.technique, TECH_TIER)
            if st.cell is not None:
                self.assertEqual(sol[st.cell], st.value, st)
            for c, v in st.eliminations:
                self.assertNotEqual(sol[c], v, st)

    def test_all_steps_agree_with_solution(self):
        for p in (P, L2, L3):
            self.assert_steps_valid(p)

    def test_hidden_single_box_unit(self):
        steps = find_steps(parse(P), techniques=["hidden_single_box"])
        self.assertTrue(steps)
        for s in steps:
            self.assertEqual(s.unit, box_of(s.cell))

    def test_technique_filter(self):
        steps = find_steps(parse(P), techniques=["naked_single"])
        self.assertTrue(all(s.technique == "naked_single" for s in steps))

    def test_easiest_is_tier_one_on_l1(self):
        steps = easiest_steps(parse(P))
        self.assertTrue(steps)
        self.assertTrue(all(TECH_TIER[s.technique] == 1 for s in steps))

    def test_titles_cover_all(self):
        self.assertEqual(set(TECH_TITLE), set(TECH_TIER))


def cands_from(rows):
    """Build a candidate grid where only listed cells have candidates: {(r, c): {..}}."""
    cands = [set() for _ in range(81)]
    for (r, c), vs in rows.items():
        cands[(r - 1) * 9 + c - 1] = set(vs)
    return cands


class WingTest(unittest.TestCase):
    def test_x_wing_rows(self):
        # 4 only in c2/c7 of rows 2 and 8 → remove 4 from c2/c7 elsewhere
        cands = cands_from({(2, 2): {4, 5}, (2, 7): {4, 6}, (8, 2): {4, 7}, (8, 7): {4, 9},
                            (5, 2): {4, 1}, (5, 5): {4, 3}, (6, 7): {4, 8}})
        steps = find_steps([1] * 81, cands, ["x_wing"])
        elims = {e for s in steps for e in s.eliminations}
        self.assertEqual(elims, {(4 * 9 + 1, 4), (5 * 9 + 6, 4)})

    def test_y_wing(self):
        # pivot r1c1 {1,2}, pincers r1c5 {1,9} (row) and r3c2 {2,9} (box) → 9 out of r3c5... cells seeing both
        cands = cands_from({(1, 1): {1, 2}, (1, 5): {1, 9}, (3, 2): {2, 9},
                            (3, 5): {9, 7}, (1, 3): {9, 4}, (7, 7): {9, 3}})
        steps = find_steps([1] * 81, cands, ["y_wing"])
        elims = {e for s in steps for e in s.eliminations}
        self.assertIn((2 * 9 + 4, 9), elims)   # r3c5 sees r1c5 (col) and r3c2 (row)
        self.assertNotIn((6 * 9 + 6, 9), elims)  # r7c7 sees neither


class GradeTest(unittest.TestCase):
    def test_grades(self):
        self.assertEqual(grade(parse(P)), 1)
        self.assertEqual(grade(parse(L2)), 2)
        self.assertEqual(grade(parse(L3)), 3)

    def test_grade_titles(self):
        self.assertEqual(sorted(GRADE_TITLE), [1, 2, 3, 4, 5])


if __name__ == "__main__":
    unittest.main()
