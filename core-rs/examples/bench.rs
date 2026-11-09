//! Native bench: cargo run --release --example bench [-- limit]. The same items and output as tools/bench_core.py
//! and demo/bench.mjs: a line per call kind — name, total ms, ms per call.

use serde::Deserialize;
use std::hint::black_box;
use std::time::Instant;
use sudoku_core::{chain_step, count_solutions, grade, parse, solve, Cands, MAX_CHAIN};

#[derive(Deserialize)]
struct Puzzle {
    givens: String,
}

#[derive(Deserialize)]
struct Stuck {
    cands: Vec<u16>,
}

fn load<T: for<'de> Deserialize<'de>>(name: &str, limit: usize) -> Vec<T> {
    let path = format!("{}/golden/{name}", env!("CARGO_MANIFEST_DIR"));
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("{path}: {e}; write it first: python3.14 tools/export_golden.py --db …"));
    let mut items: Vec<T> = serde_json::from_str(&text).unwrap();
    items.truncate(limit);
    items
}

fn bench<T>(name: &str, items: &[T], f: impl Fn(&T)) {
    let t = Instant::now();
    for x in items {
        f(x);
    }
    let ms = t.elapsed().as_secs_f64() * 1000.0;
    println!("{name:<16}{ms:>10.1}{:>10.4}", ms / items.len() as f64);
}

fn main() {
    let limit = std::env::args().nth(1).map_or(usize::MAX, |s| s.parse().expect("limit: a number"));
    let puzzles: Vec<String> = load::<Puzzle>("puzzles.json", limit).into_iter().map(|p| p.givens).collect();
    let stuck: Vec<Cands> =
        load::<Stuck>("stuck.json", limit).into_iter().map(|s| s.cands.try_into().expect("81 masks")).collect();
    bench("grade", &puzzles, |s| {
        black_box(grade(&parse(s).unwrap()));
    });
    bench("solve", &puzzles, |s| {
        black_box(solve(&parse(s).unwrap()));
    });
    bench("count_solutions", &puzzles, |s| {
        black_box(count_solutions(&parse(s).unwrap(), 2));
    });
    bench("chain_step", &stuck, |c| {
        black_box(chain_step(c, MAX_CHAIN));
    });
}
