"""Golden data for core-rs: what the Python core answers, as JSON for the Rust parity test (core-rs/tests/parity.rs).

Usage: python3.14 tools/export_golden.py [--db data/sudoku.db] [--positions 2000]

Writes core-rs/golden/ (not in git: the positions come from the owner's games):
- puzzles.json: every puzzle — givens, grade, solution, count_solutions(limit=2)
- positions.json: distinct boards from games (the start and after each place / erase / undo), every k-th to stay
  within --positions — grid, candidates as bit masks, find_steps over all techniques, easiest_steps
- stuck.json: grade-5 puzzles at the point where techniques 1-4 run out — candidates, find_steps, chain_step
The database is opened read-only.
"""

import argparse
import json
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analysis import replay
from sudoku_core import (
    PEERS,
    TECH_TIER,
    candidates,
    chain_step,
    count_solutions,
    easiest_steps,
    find_steps,
    grade,
    parse,
    solve,
    to_str,
)

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOLDEN = os.path.join(HERE, "core-rs", "golden")


def tier(n):
    return [t for t, k in TECH_TIER.items() if k == n]


def masks(cands):
    return [sum(1 << v for v in c) for c in cands]


def step_json(st):
    return {
        "technique": st.technique,
        "cell": st.cell,
        "value": st.value,
        "unit": st.unit,
        "eliminations": sorted(st.eliminations),
        "pattern": st.pattern,
        "chain": st.chain,
    }


def stuck_cands(g):
    """Candidates where grade() gives up on techniques 1-4 (it returns 5 there), or None if they solve the grid or it
    hits a contradiction. The loop is grade()'s own."""
    g, cands = g[:], candidates(g)
    while 0 in g:
        if any(not g[i] and not cands[i] for i in range(81)):
            return None
        placements = find_steps(g, cands, tier(1))
        if placements:
            for st in placements:
                if not g[st.cell] and st.value in cands[st.cell]:
                    g[st.cell] = st.value
                    cands[st.cell] = set()
                    for p in PEERS[st.cell]:
                        cands[p].discard(st.value)
            continue
        for t in (2, 3, 4):
            steps = find_steps(g, cands, tier(t))
            if steps:
                for st in steps:
                    for c, v in st.eliminations:
                        cands[c].discard(v)
                break
        else:
            return cands
    return None


def game_boards(conn):
    """Distinct boards from games, in game and move order."""
    seen, out = set(), []
    games = conn.execute("SELECT g.id, p.givens FROM games g JOIN puzzles p ON p.id = g.puzzle_id ORDER BY g.id")
    for game_id, givens in games.fetchall():
        rows = conn.execute("SELECT seq, cell, value, kind FROM moves WHERE game_id = ? ORDER BY seq", (game_id,))
        moves = [dict(zip(("seq", "cell", "value", "kind"), r, strict=True)) for r in rows]
        boards = [parse(givens)]
        boards += [replay(givens, moves, m["seq"]) for m in moves if m["kind"] in ("place", "erase", "undo")]
        for b in boards:
            key = to_str(b)
            if key not in seen:
                seen.add(key)
                out.append(b)
    return out


def write(name, data):
    with open(os.path.join(GOLDEN, name), "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"{name}: {len(data)}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(HERE, "data", "sudoku.db"))
    ap.add_argument("--positions", type=int, default=2000)
    args = ap.parse_args()
    conn = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    os.makedirs(GOLDEN, exist_ok=True)

    puzzles = []
    for (givens,) in conn.execute("SELECT givens FROM puzzles ORDER BY id").fetchall():
        g = parse(givens)
        sol = solve(g)
        puzzles.append(
            {"givens": givens, "grade": grade(g), "solution": to_str(sol) if sol else None, "count": count_solutions(g)}
        )
    write("puzzles.json", puzzles)

    boards = game_boards(conn)
    every = max(1, -(-len(boards) // args.positions))
    positions = []
    for b in boards[::every]:
        c = candidates(b)
        positions.append(
            {
                "grid": to_str(b),
                "cands": masks(c),
                "steps": [step_json(s) for s in find_steps(b, c)],
                "easiest": [step_json(s) for s in easiest_steps(b, c)],
            }
        )
    write("positions.json", positions)

    stuck = []
    for p in puzzles:
        if p["grade"] != 5:
            continue
        g = parse(p["givens"])
        c = stuck_cands(g)
        if c is None:
            continue
        ch = chain_step(c)
        stuck.append(
            {
                "givens": p["givens"],
                "cands": masks(c),
                "steps": [step_json(s) for s in find_steps(g, c)],
                "chain": step_json(ch) if ch else None,
            }
        )
    write("stuck.json", stuck)


if __name__ == "__main__":
    main()
