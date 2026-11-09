"""Bench of the Python core on the golden data (write it first with tools/export_golden.py).

Usage: python3.14 tools/bench_core.py [--limit N]

The same items and output as core-rs/examples/bench.rs and core-rs/demo/bench.mjs: a line per call kind — name,
total ms, ms per call. grade, solve and count_solutions parse the grid from its string on every call, as the WASM
calls do; chain_step gets ready candidates.
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sudoku_core import chain_step, count_solutions, grade, parse, solve

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOLDEN = os.path.join(HERE, "core-rs", "golden")


def load(name, limit):
    with open(os.path.join(GOLDEN, name)) as f:
        return json.load(f)[:limit]


def bench(name, items, fn):
    t = time.perf_counter()
    for x in items:
        fn(x)
    ms = (time.perf_counter() - t) * 1000
    print(f"{name:<16}{ms:>10.1f}{ms / len(items):>10.4f}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    limit = ap.parse_args().limit
    puzzles = [p["givens"] for p in load("puzzles.json", limit)]
    stuck = [[{v for v in range(1, 10) if m >> v & 1} for m in s["cands"]] for s in load("stuck.json", limit)]
    bench("grade", puzzles, lambda s: grade(parse(s)))
    bench("solve", puzzles, lambda s: solve(parse(s)))
    bench("count_solutions", puzzles, lambda s: count_solutions(parse(s), 2))
    bench("chain_step", stuck, chain_step)


if __name__ == "__main__":
    main()
