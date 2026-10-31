"""Sudoku core: parsing, candidates, named solving steps, solver and grading.

Cells are 0..80 (row * 9 + col). Units are 0..26: rows 0-8, columns 9-17, boxes 18-26.
"""
from dataclasses import dataclass, field
from itertools import combinations

from i18n import tr

Grid = list  # 81 ints, 0 = empty

ROWS = [[r * 9 + c for c in range(9)] for r in range(9)]
COLS = [[r * 9 + c for r in range(9)] for c in range(9)]
BOXES = [[(br * 3 + r) * 9 + bc * 3 + c for r in range(3) for c in range(3)]
         for br in range(3) for bc in range(3)]
UNITS = ROWS + COLS + BOXES
PEERS = [frozenset().union(*(u for u in UNITS if i in u)) - {i} for i in range(81)]
BOX_OF = [18 + (i // 27) * 3 + (i % 9) // 3 for i in range(81)]

TECH_TIER = {
    "naked_single": 1, "hidden_single_box": 1, "hidden_single_row": 1, "hidden_single_col": 1,
    "pointing": 2, "claiming": 2,
    "naked_pair": 3, "hidden_pair": 3,
    "x_wing": 4, "y_wing": 4,
}
GRADE_TITLE = {1: "одиночки", 2: "+ pointing / claiming", 3: "+ пары", 4: "+ X-Wing / Y-Wing", 5: "сложнее"}
TECH_TITLE = {
    "naked_single": "Голая одиночка (Naked Single)",
    "hidden_single_box": "Скрытая одиночка в блоке (Hidden Single)",
    "hidden_single_row": "Скрытая одиночка в строке (Hidden Single)",
    "hidden_single_col": "Скрытая одиночка в столбце (Hidden Single)",
    "pointing": "Указывающая пара (Pointing)",
    "claiming": "Захват (Claiming)",
    "naked_pair": "Голая пара (Naked Pair)",
    "hidden_pair": "Скрытая пара (Hidden Pair)",
    "x_wing": "X-Wing",
    "y_wing": "Y-Wing (XY-Wing)",
}
_HIDDEN_UNITS = {"hidden_single_row": range(0, 9), "hidden_single_col": range(9, 18),
                 "hidden_single_box": range(18, 27)}


@dataclass
class Step:
    technique: str
    cell: int | None = None
    value: int | None = None
    unit: int | None = None
    eliminations: list = field(default_factory=list)  # [(cell, value)]
    pattern: list = field(default_factory=list)  # cells forming the pattern (for explanations)


def parse(s: str) -> Grid:
    chars = [ch for ch in s if ch.isdigit() or ch == "."]
    if len(chars) != 81:
        raise ValueError(tr("нужно 81 клетку, получено {n}", n=len(chars)))
    return [0 if ch == "." else int(ch) for ch in chars]


def to_str(g: Grid) -> str:
    return "".join(map(str, g))


def unit_name(u: int) -> str:
    return tr(("строка {n}", "столбец {n}", "блок {n}")[u // 9], n=u % 9 + 1)


def candidates(g: Grid) -> list:
    return [set() if g[i] else set(range(1, 10)) - {g[p] for p in PEERS[i]} for i in range(81)]


def _search(g: Grid, limit: int):
    """Bitmask backtracking. Returns (count capped at limit, first solution or None)."""
    rows, cols, boxes = [0] * 9, [0] * 9, [0] * 9
    g = g[:]
    for i, v in enumerate(g):
        if v:
            bit = 1 << v
            r, c, b = i // 9, i % 9, BOX_OF[i] - 18
            if (rows[r] | cols[c] | boxes[b]) & bit:
                return 0, None
            rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit
    empties = [i for i in range(81) if not g[i]]
    found = [0, None]

    def rec(k):
        if k == len(empties):
            found[0] += 1
            if found[1] is None:
                found[1] = g[:]
            return
        best, best_free, best_n = k, 0, 10
        for j in range(k, len(empties)):
            i = empties[j]
            free = ~(rows[i // 9] | cols[i % 9] | boxes[BOX_OF[i] - 18]) & 0x3FE
            n = bin(free).count("1")
            if n < best_n:
                best, best_free, best_n = j, free, n
                if n <= 1:
                    break
        if best_n == 0:
            return
        empties[k], empties[best] = empties[best], empties[k]
        i = empties[k]
        r, c, b = i // 9, i % 9, BOX_OF[i] - 18
        for v in range(1, 10):
            bit = 1 << v
            if best_free & bit:
                g[i] = v
                rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit
                rec(k + 1)
                rows[r] ^= bit; cols[c] ^= bit; boxes[b] ^= bit
                if found[0] >= limit:
                    break
        g[i] = 0
        empties[k], empties[best] = empties[best], empties[k]

    rec(0)
    return found[0], found[1]


def count_solutions(g: Grid, limit: int = 2) -> int:
    return _search(g, limit)[0]


def solve(g: Grid):
    return _search(g, 1)[1]


def _hidden_singles(g, cands, technique):
    for u in _HIDDEN_UNITS[technique]:
        for v in range(1, 10):
            spots = [i for i in UNITS[u] if v in cands[i]]
            if len(spots) == 1:
                yield Step(technique, cell=spots[0], value=v, unit=u, pattern=spots)


def _locked(g, cands, technique):
    # pointing: candidates in a box confined to one line; claiming: in a line confined to one box
    sources = range(18, 27) if technique == "pointing" else range(0, 18)
    for u in sources:
        for v in range(1, 10):
            spots = [i for i in UNITS[u] if v in cands[i]]
            if len(spots) < 2:
                continue
            if technique == "pointing":
                targets = [w for w in (spots[0] // 9, 9 + spots[0] % 9) if all(s in UNITS[w] for s in spots)]
            else:
                targets = [BOX_OF[spots[0]]] if all(BOX_OF[s] == BOX_OF[spots[0]] for s in spots) else []
            for w in targets:
                elim = [(i, v) for i in UNITS[w] if i not in spots and v in cands[i]]
                if elim:
                    yield Step(technique, unit=u, eliminations=elim, pattern=spots)


def _naked_pairs(g, cands):
    for u in range(27):
        empty = [i for i in UNITS[u] if cands[i]]
        for a, b in combinations(empty, 2):
            if len(cands[a]) == 2 and cands[a] == cands[b]:
                elim = [(i, v) for i in empty if i not in (a, b) for v in cands[a] if v in cands[i]]
                if elim:
                    yield Step("naked_pair", unit=u, eliminations=elim, pattern=[a, b])


def _hidden_pairs(g, cands):
    for u in range(27):
        for x, y in combinations(range(1, 10), 2):
            sx = [i for i in UNITS[u] if x in cands[i]]
            if len(sx) != 2 or sx != [i for i in UNITS[u] if y in cands[i]]:
                continue
            elim = [(i, v) for i in sx for v in sorted(cands[i] - {x, y})]
            if elim:
                yield Step("hidden_pair", unit=u, eliminations=elim, pattern=sx)


def _x_wings(g, cands):
    # base lines: rows (cover = columns) then columns (cover = rows)
    for base, cover_of in ((range(0, 9), lambda i: 9 + i % 9), (range(9, 18), lambda i: i // 9)):
        for v in range(1, 10):
            lines = []
            for u in base:
                spots = [i for i in UNITS[u] if v in cands[i]]
                if len(spots) == 2:
                    lines.append((spots, (cover_of(spots[0]), cover_of(spots[1]))))
            for (s1, c1), (s2, c2) in combinations(lines, 2):
                if c1 != c2:
                    continue
                corners = set(s1 + s2)
                elim = [(i, v) for w in c1 for i in UNITS[w] if i not in corners and v in cands[i]]
                if elim:
                    yield Step("x_wing", eliminations=elim, pattern=sorted(corners))


def _y_wings(g, cands):
    bivalue = [i for i in range(81) if len(cands[i]) == 2]
    for p in bivalue:
        x, y = sorted(cands[p])
        wings = [i for i in bivalue if i in PEERS[p]]
        for a in wings:
            if x not in cands[a] or y in cands[a]:
                continue
            (z,) = cands[a] - {x}
            for b in wings:
                if b == a or cands[b] != {y, z}:
                    continue
                elim = [(i, z) for i in PEERS[a] & PEERS[b] if i != p and z in cands[i]]
                if elim:
                    yield Step("y_wing", eliminations=elim, pattern=[p, a, b])


def find_steps(g: Grid, cands=None, techniques=None) -> list:
    """All steps available in this position for the given techniques (default: all)."""
    cands = candidates(g) if cands is None else cands
    wanted = TECH_TIER.keys() if techniques is None else techniques
    steps = []
    for t in wanted:
        if t == "naked_single":
            steps += [Step(t, cell=i, value=next(iter(c)), pattern=[i]) for i, c in enumerate(cands) if len(c) == 1]
        elif t in _HIDDEN_UNITS:
            steps += _hidden_singles(g, cands, t)
        elif t in ("pointing", "claiming"):
            steps += _locked(g, cands, t)
        elif t == "naked_pair":
            steps += _naked_pairs(g, cands)
        elif t == "hidden_pair":
            steps += _hidden_pairs(g, cands)
        elif t == "x_wing":
            steps += _x_wings(g, cands)
        elif t == "y_wing":
            steps += _y_wings(g, cands)
        else:
            raise ValueError(tr("неизвестная техника: {t}", t=t))
    return steps


def _tier(n):
    return [t for t, tier in TECH_TIER.items() if tier == n]


def easiest_steps(g: Grid, cands=None) -> list:
    cands = candidates(g) if cands is None else cands
    for tier in (1, 2, 3, 4):
        steps = find_steps(g, cands, _tier(tier))
        if steps:
            return steps
    return []


def grade(g: Grid) -> int:
    """Highest technique tier needed to solve logically (1..4), or 5 if the core can't solve it."""
    g, cands, used = g[:], candidates(g), 1
    while 0 in g:
        if any(not g[i] and not cands[i] for i in range(81)):
            return 5
        placements = find_steps(g, cands, _tier(1))
        if placements:
            for st in placements:
                if not g[st.cell] and st.value in cands[st.cell]:
                    g[st.cell] = st.value
                    cands[st.cell] = set()
                    for p in PEERS[st.cell]:
                        cands[p].discard(st.value)
            continue
        for tier in (2, 3, 4):
            steps = find_steps(g, cands, _tier(tier))
            if steps:
                for st in steps:
                    for c, v in st.eliminations:
                        cands[c].discard(v)
                used = max(used, tier)
                break
        else:
            return 5
    return used
