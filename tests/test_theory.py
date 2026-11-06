"""Theory pages: frontmatter, and every ```sudoku diagram (format of web/js/diagram.js) is a legal picture."""

import os
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))

from import_bank import parse_theory

from sudoku_core import PEERS, UNITS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RU = os.path.join(ROOT, "theory")
EN = os.path.join(RU, "en")
SLUGS = sorted(f[:-3] for f in os.listdir(RU) if f.endswith(".md"))
FENCE = re.compile(r"^```(\w*)\n(.*?)^```", re.M | re.S)
CELL = re.compile(r"^r([1-9])c([1-9])$")


def cell(ref):
    m = CELL.match(ref)
    if not m:
        raise ValueError(f"bad cell {ref!r}")
    return (int(m[1]) - 1) * 9 + int(m[2]) - 1


def parse_diagram(text):
    """Mirror of diagram.js parseDiagram: {values, unit, pat, x, ans, cands, elims, arrows, caption}."""
    rows, d = [], {"unit": [], "pat": [], "x": [], "ans": {}, "cands": {}, "elims": {}, "arrows": [], "caption": ""}
    for line in (raw.strip() for raw in text.splitlines()):
        kv = re.match(r"^([a-z]+):\s*(.*)$", line)
        if kv:
            key, refs = kv[1], kv[2].split()
            if key == "caption":
                d["caption"] = kv[2]
            elif key == "unit":
                for r in refs:
                    assert re.fullmatch(r"[rcb][1-9]", r), f"bad unit {r!r}"
                    d["unit"].append(r)
            elif key in ("pat", "x"):
                d[key] += [cell(r) for r in refs]
            elif key == "arrow":
                d["arrows"] += [tuple(cell(x) for x in r.split(">")) for r in refs]
            elif key in ("ans", "cand", "elim"):
                for r in refs:
                    ref, _, digits = r.partition("=")
                    assert re.fullmatch(r"[1-9]+", digits), f"bad digits in {r!r}"
                    name = {"ans": "ans", "cand": "cands", "elim": "elims"}[key]
                    d[name][cell(ref)] = int(digits) if key == "ans" else [int(v) for v in digits]
            else:
                raise AssertionError(f"unknown key {key!r}")
            continue
        if not line or re.fullmatch(r"[-+\s|]+", line):
            continue
        cells = line.replace("|", " ").split()
        assert len(cells) == 9 and all(re.fullmatch(r"[1-9.]", c) for c in cells), f"bad grid row {line!r}"
        rows += [0 if c == "." else int(c) for c in cells]
    assert len(rows) == 81, f"{len(rows) // 9} grid rows, need 9"
    d["values"] = rows
    return d


def diagrams(path):
    with open(path, encoding="utf-8") as f:
        return [m[2] for m in FENCE.finditer(f.read()) if m[1] == "sudoku"]


def check(d):
    v = d["values"]
    for u in UNITS:
        digits = [v[i] for i in u if v[i]]
        assert len(digits) == len(set(digits)), f"a repeated digit in a group: {sorted(digits)}"
    seen = lambda i: {v[p] for p in PEERS[i]}  # noqa: E731
    for i, a in d["ans"].items():
        assert not v[i], f"ans on a filled cell r{i // 9 + 1}c{i % 9 + 1}"
        assert a not in seen(i), f"ans {a} at r{i // 9 + 1}c{i % 9 + 1} is seen by a digit"
    for i in d["x"]:
        assert not v[i], f"x on a filled cell r{i // 9 + 1}c{i % 9 + 1}"
    for name in ("cands", "elims"):
        for i, ds in d[name].items():
            assert not v[i], f"{name} on a filled cell r{i // 9 + 1}c{i % 9 + 1}"
            assert not set(ds) & seen(i), f"{name} {ds} at r{i // 9 + 1}c{i % 9 + 1}: a digit there already sees it"
    for a, b in d["arrows"]:
        assert v[a] or a in d["cands"], f"arrow from an empty cell r{a // 9 + 1}c{a % 9 + 1}"
        assert b in PEERS[a], f"arrow r{a // 9 + 1}c{a % 9 + 1}>r{b // 9 + 1}c{b % 9 + 1}: not in one group"


class TestTheory(unittest.TestCase):
    def test_frontmatter(self):
        for slug in SLUGS:
            for base in (RU, EN):
                with self.subTest(slug=slug, lang=os.path.basename(base)):
                    with open(os.path.join(base, slug + ".md"), encoding="utf-8") as f:
                        meta, _ = parse_theory(f.read())
                    self.assertEqual(meta["slug"], slug)
                    self.assertTrue(0 < len(meta.get("summary", "")) <= 120, "summary: one line, up to 120 chars")

    def test_diagrams_are_legal(self):
        for slug in SLUGS:
            for base in (RU, EN):
                for k, text in enumerate(diagrams(os.path.join(base, slug + ".md"))):
                    with self.subTest(slug=slug, lang=os.path.basename(base), diagram=k + 1):
                        check(parse_diagram(text))

    def test_english_diagrams_match_russian(self):
        """The same pictures in both languages: grids and marks equal, only captions differ."""
        for slug in SLUGS:
            with self.subTest(slug=slug):
                ru = [parse_diagram(t) for t in diagrams(os.path.join(RU, slug + ".md"))]
                en = [parse_diagram(t) for t in diagrams(os.path.join(EN, slug + ".md"))]
                strip = lambda d: {k: v for k, v in d.items() if k != "caption"}  # noqa: E731
                self.assertEqual([strip(d) for d in ru], [strip(d) for d in en])

    def test_every_technique_page_has_a_diagram(self):
        for slug in (s for s in SLUGS if s != "speed-habits"):  # habits, not a pattern on the board
            with self.subTest(slug=slug):
                self.assertTrue(diagrams(os.path.join(RU, slug + ".md")), "no ```sudoku diagram")

    def test_parser_reads_every_key(self):
        grid = "\n".join(["5 . . | . . . | . . ."] + [". . . | . . . | . . ."] * 8)
        marks = "unit: r1 b1\npat: r1c1\nx: r1c2\nans: r1c3=4\ncand: r2c2=12\nelim: r2c2=2\n"
        marks += "arrow: r1c1>r1c2\ncaption: a b"
        d = parse_diagram(grid + "\n" + marks)
        self.assertEqual(
            (d["unit"], d["pat"], d["x"], d["ans"], d["cands"], d["elims"], d["arrows"], d["caption"]),
            (["r1", "b1"], [0], [1], {2: 4}, {10: [1, 2]}, {10: [2]}, [(0, 1)], "a b"),
        )
        with self.assertRaises(AssertionError):
            check(parse_diagram("\n".join(["5 5 . | . . . | . . ."] + [". . . | . . . | . . ."] * 8)))


if __name__ == "__main__":
    unittest.main()
