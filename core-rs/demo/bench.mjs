// WASM bench in Node: node core-rs/demo/bench.mjs [limit]. The same items and output as tools/bench_core.py and
// examples/bench.rs: a line per call kind — name, total ms, ms per call.
import { readFileSync } from "node:fs";
import { initSync, grade, solve, countSolutions, chainStep } from "../pkg/sudoku_core.js";

initSync({ module: readFileSync(new URL("../pkg/sudoku_core_bg.wasm", import.meta.url)) });

const limit = Number(process.argv[2] ?? Infinity);
const load = name => JSON.parse(readFileSync(new URL(`../golden/${name}`, import.meta.url), "utf8")).slice(0, limit);
const puzzles = load("puzzles.json").map(p => p.givens);
const stuck = load("stuck.json").map(s => Uint16Array.from(s.cands));

function bench(name, items, fn) {
  const t = performance.now();
  for (const x of items) fn(x);
  const ms = performance.now() - t;
  console.log(`${name.padEnd(16)}${ms.toFixed(1).padStart(10)}${(ms / items.length).toFixed(4).padStart(10)}`);
}

bench("grade", puzzles, grade);
bench("solve", puzzles, solve);
bench("count_solutions", puzzles, g => countSolutions(g, 2));
bench("chain_step", stuck, chainStep);
