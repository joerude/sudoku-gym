//! Parity with the Python core on the golden data that tools/export_golden.py writes into core-rs/golden/.

use serde::Deserialize;
use sudoku_core::{
    candidates, chain_step, count_solutions, easiest_steps, find_steps, grade, parse, solve, to_str, Cands, Step,
    Technique, MAX_CHAIN,
};

#[derive(Deserialize, Debug, PartialEq)]
struct GoldenStep {
    technique: String,
    cell: Option<u8>,
    value: Option<u8>,
    unit: Option<u8>,
    eliminations: Vec<(u8, u8)>,
    pattern: Vec<u8>,
    chain: Vec<(u8, u8)>,
}

impl From<&Step> for GoldenStep {
    fn from(s: &Step) -> Self {
        let mut eliminations = s.eliminations.clone();
        eliminations.sort_unstable();
        GoldenStep {
            technique: s.technique.slug().to_string(),
            cell: s.cell,
            value: s.value,
            unit: s.unit,
            eliminations,
            pattern: s.pattern.clone(),
            chain: s.chain.clone(),
        }
    }
}

fn golden(steps: &[Step]) -> Vec<GoldenStep> {
    steps.iter().map(GoldenStep::from).collect()
}

#[derive(Deserialize)]
struct Puzzle {
    givens: String,
    grade: u8,
    solution: Option<String>,
    count: u32,
}

#[derive(Deserialize)]
struct Position {
    grid: String,
    cands: Vec<u16>,
    steps: Vec<GoldenStep>,
    easiest: Vec<GoldenStep>,
}

#[derive(Deserialize)]
struct Stuck {
    givens: String,
    cands: Vec<u16>,
    steps: Vec<GoldenStep>,
    chain: Option<GoldenStep>,
}

fn load<T: for<'de> Deserialize<'de>>(name: &str) -> Vec<T> {
    let path = format!("{}/golden/{name}", env!("CARGO_MANIFEST_DIR"));
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("{path}: {e}; write it first: python3.14 tools/export_golden.py --db …"));
    let items: Vec<T> = serde_json::from_str(&text).unwrap();
    assert!(!items.is_empty(), "{path} is empty");
    items
}

fn report(what: &str, total: usize, bad: &[String]) {
    assert!(bad.is_empty(), "{what}: {} of {total} differ; first:\n{}", bad.len(), bad[..bad.len().min(3)].join("\n"));
}

fn cands_of(masks: &[u16]) -> Cands {
    masks.try_into().expect("81 candidate masks")
}

#[test]
fn puzzles_grade_solve_count() {
    let puzzles: Vec<Puzzle> = load("puzzles.json");
    let mut bad = Vec::new();
    for p in &puzzles {
        let g = parse(&p.givens).unwrap();
        let got = (grade(&g), solve(&g).map(|s| to_str(&s)), count_solutions(&g, 2));
        let want = (p.grade, p.solution.clone(), p.count);
        if got != want {
            bad.push(format!("{}: rust {got:?}, python {want:?}", p.givens));
        }
    }
    report("puzzles", puzzles.len(), &bad);
}

#[test]
fn positions_candidates_and_steps() {
    let positions: Vec<Position> = load("positions.json");
    let mut bad = Vec::new();
    for p in &positions {
        let c = candidates(&parse(&p.grid).unwrap());
        if c.as_slice() != p.cands.as_slice() {
            bad.push(format!("{}: candidates differ", p.grid));
            continue;
        }
        let steps = golden(&find_steps(&c, &Technique::GRADED));
        if steps != p.steps {
            bad.push(format!("{}: find_steps\n  rust   {steps:?}\n  python {:?}", p.grid, p.steps));
        }
        let easiest = golden(&easiest_steps(&c));
        if easiest != p.easiest {
            bad.push(format!("{}: easiest_steps\n  rust   {easiest:?}\n  python {:?}", p.grid, p.easiest));
        }
    }
    report("positions", positions.len(), &bad);
}

#[test]
fn stuck_states_steps_and_chain() {
    let stuck: Vec<Stuck> = load("stuck.json");
    let mut bad = Vec::new();
    for s in &stuck {
        let c = cands_of(&s.cands);
        let steps = golden(&find_steps(&c, &Technique::GRADED));
        if steps != s.steps {
            bad.push(format!("{}: find_steps\n  rust   {steps:?}\n  python {:?}", s.givens, s.steps));
        }
        let chain = chain_step(&c, MAX_CHAIN).as_ref().map(GoldenStep::from);
        if chain != s.chain {
            bad.push(format!("{}: chain_step\n  rust   {chain:?}\n  python {:?}", s.givens, s.chain));
        }
    }
    report("stuck", stuck.len(), &bad);
}
