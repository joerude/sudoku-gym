"""Generate sudoku puzzles with a unique solution, graded by the techniques needed."""

import random
import sys
from itertools import combinations

ROWS = [[r * 9 + c for c in range(9)] for r in range(9)]
COLS = [[r * 9 + c for r in range(9)] for c in range(9)]
BOXES = [[(br * 3 + r) * 9 + bc * 3 + c for r in range(3) for c in range(3)] for br in range(3) for bc in range(3)]
UNITS = ROWS + COLS + BOXES
PEERS = [set().union(*(u for u in UNITS if i in u)) - {i} for i in range(81)]


def count_solutions(g, limit=2):
    g = g[:]

    def rec():
        best, opts = None, None
        for i in range(81):
            if g[i] == 0:
                o = set(range(1, 10)) - {g[p] for p in PEERS[i]}
                if not o:
                    return 0
                if best is None or len(o) < len(opts):
                    best, opts = i, o
        if best is None:
            return 1
        n = 0
        for v in opts:
            g[best] = v
            n += rec()
            if n >= limit:
                break
        g[best] = 0
        return n

    return rec()


def full_grid(rng):
    g = [0] * 81

    def rec(i=0):
        if i == 81:
            return True
        vals = list(set(range(1, 10)) - {g[p] for p in PEERS[i]})
        rng.shuffle(vals)
        for v in vals:
            g[i] = v
            if rec(i + 1):
                return True
        g[i] = 0
        return False

    rec()
    return g


def logic_solve(grid, level):
    """Return (solved, max_level_used). level: 1 singles, 2 +locked candidates, 3 +pairs."""
    g = grid[:]
    cand = [set() if g[i] else set(range(1, 10)) - {g[p] for p in PEERS[i]} for i in range(81)]
    used = 1

    def place(i, v):
        g[i] = v
        cand[i] = set()
        for p in PEERS[i]:
            cand[p].discard(v)

    while 0 in g:
        if any(g[i] == 0 and not cand[i] for i in range(81)):
            return False, used
        progress = False
        for i in range(81):
            if g[i] == 0 and len(cand[i]) == 1:
                place(i, next(iter(cand[i])))
                progress = True
        for u in UNITS:
            for v in range(1, 10):
                spots = [i for i in u if v in cand[i]]
                if len(spots) == 1:
                    place(spots[0], v)
                    progress = True
        if progress:
            continue
        if level >= 2:
            for u in UNITS:
                for v in range(1, 10):
                    spots = [i for i in u if v in cand[i]]
                    if len(spots) < 2:
                        continue
                    for w in UNITS:
                        if w is not u and all(s in w for s in spots):
                            for i in w:
                                if i not in spots and v in cand[i]:
                                    cand[i].discard(v)
                                    progress = True
            if progress:
                used = max(used, 2)
                continue
        if level >= 3:
            for u in UNITS:
                empty = [i for i in u if g[i] == 0]
                for a, b in combinations(empty, 2):
                    if len(cand[a]) == 2 and cand[a] == cand[b]:
                        for i in empty:
                            if i not in (a, b) and cand[i] & cand[a]:
                                cand[i] -= cand[a]
                                progress = True
                for x, y in combinations(range(1, 10), 2):
                    sx = {i for i in empty if x in cand[i]}
                    sy = {i for i in empty if y in cand[i]}
                    if len(sx) == 2 and sx == sy:
                        for i in sx:
                            if cand[i] - {x, y}:
                                cand[i] &= {x, y}
                                progress = True
            if progress:
                used = max(used, 3)
                continue
        return False, used
    return True, used


def grade(p):
    for lvl in (1, 2, 3):
        ok, used = logic_solve(p, lvl)
        if ok:
            return used
    return 4


def make_puzzle(rng, target_clues):
    sol = full_grid(rng)
    p = sol[:]
    cells = list(range(41))
    rng.shuffle(cells)
    for i in cells:
        j = 80 - i
        keep = p[i], p[j]
        p[i] = p[j] = 0
        if count_solutions(p) != 1:
            p[i], p[j] = keep
        elif sum(1 for x in p if x) <= target_clues:
            break
    return p, sol


def fmt(g):
    lines = []
    for r in range(9):
        if r and r % 3 == 0:
            lines.append("------+-------+------")
        row = ["." if g[r * 9 + c] == 0 else str(g[r * 9 + c]) for c in range(9)]
        lines.append(" ".join(row[0:3]) + " | " + " ".join(row[3:6]) + " | " + " ".join(row[6:9]))
    return "\n".join(lines)


if __name__ == "__main__":
    rng = random.Random(int(sys.argv[1]) if len(sys.argv) > 1 else 2026)
    want = {1: 3, 2: 3, 3: 3}
    found = {1: [], 2: [], 3: []}
    while any(len(found[k]) < want[k] for k in want):
        p, sol = make_puzzle(rng, rng.choice([24, 26, 28]))
        lvl = grade(p)
        if lvl in found and len(found[lvl]) < want[lvl]:
            assert count_solutions(p) == 1
            found[lvl].append((p, sol))
    for lvl in (1, 2, 3):
        for n, (p, sol) in enumerate(found[lvl], 1):
            clues = sum(1 for x in p if x)
            print(f"### L{lvl}-{n} (подсказок: {clues})\n")
            print("Строка (81 символ, 0 = пусто): `" + "".join(map(str, p)) + "`\n")
            print("```\n" + fmt(p) + "\n```\n")
            print("Решение: `" + "".join(map(str, sol)) + "`\n")
