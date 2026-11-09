//! Sudoku core in Rust, a port of sudoku_core.py: parsing, candidates, named solving steps, solver, grading, chains.
//!
//! Cells are 0..80 (row * 9 + col). Units are 0..26: rows 0-8, columns 9-17, boxes 18-26. Candidates are bit
//! masks: bit v set means digit v is a candidate (bits 1..=9). Techniques scan in the same order as the Python
//! core, so the same steps come out in the same order (tests/parity.rs checks it on the golden data).

use std::fmt;

pub mod solver;

pub use solver::{count_solutions, solve};

pub mod techniques;

pub use techniques::{candidates, easiest_steps, find_steps, grade};

pub mod chains;

pub use chains::{chain_step, MAX_CHAIN};

pub type Grid = [u8; 81]; // 0 = empty
pub type Cands = [u16; 81];

pub const UNITS: [[u8; 9]; 27] = build_units();
pub const BOX_OF: [u8; 81] = build_box_of();
/// Peers of each cell as a set over cells: bit i = cell i.
pub const PEER_BITS: [u128; 81] = build_peer_bits();
/// Peers of each cell, ascending.
pub const PEERS: [[u8; 20]; 81] = build_peers();

const fn build_units() -> [[u8; 9]; 27] {
    let mut u = [[0u8; 9]; 27];
    let mut k = 0;
    while k < 9 {
        let mut j = 0;
        while j < 9 {
            u[k][j] = (k * 9 + j) as u8;
            u[9 + k][j] = (j * 9 + k) as u8;
            u[18 + k][j] = (((k / 3) * 3 + j / 3) * 9 + (k % 3) * 3 + j % 3) as u8;
            j += 1;
        }
        k += 1;
    }
    u
}

const fn build_box_of() -> [u8; 81] {
    let mut b = [0u8; 81];
    let mut i = 0;
    while i < 81 {
        b[i] = (18 + (i / 27) * 3 + (i % 9) / 3) as u8;
        i += 1;
    }
    b
}

const fn build_peer_bits() -> [u128; 81] {
    let mut p = [0u128; 81];
    let mut i = 0;
    while i < 81 {
        let units = [i / 9, 9 + i % 9, BOX_OF[i] as usize];
        let mut k = 0;
        while k < 3 {
            let mut j = 0;
            while j < 9 {
                p[i] |= 1u128 << (UNITS[units[k]][j] as u32);
                j += 1;
            }
            k += 1;
        }
        p[i] &= !(1u128 << (i as u32));
        i += 1;
    }
    p
}

const fn build_peers() -> [[u8; 20]; 81] {
    let mut out = [[0u8; 20]; 81];
    let mut i = 0;
    while i < 81 {
        let (mut c, mut n) = (0, 0);
        while c < 81 {
            if (PEER_BITS[i] >> c) & 1 == 1 {
                out[i][n] = c as u8;
                n += 1;
            }
            c += 1;
        }
        i += 1;
    }
    out
}

/// Digits of a candidate mask, ascending.
pub fn digits(mask: u16) -> impl Iterator<Item = u8> {
    (1..=9u8).filter(move |&v| mask & (1 << v) != 0)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Technique {
    NakedSingle,
    HiddenSingleBox,
    HiddenSingleRow,
    HiddenSingleCol,
    Pointing,
    Claiming,
    NakedPair,
    HiddenPair,
    XWing,
    YWing,
    XChain, // chains: hints only, find_steps and grade stop at Y-Wing
    Aic,
}

use Technique::*;

/// Techniques by tier 1..4, in the order of TECH_TIER in sudoku_core.py.
pub const TIERS: [&[Technique]; 4] = [
    &[NakedSingle, HiddenSingleBox, HiddenSingleRow, HiddenSingleCol],
    &[Pointing, Claiming],
    &[NakedPair, HiddenPair],
    &[XWing, YWing],
];

impl Technique {
    /// What find_steps knows, in TECH_TIER order (its default in Python).
    pub const GRADED: [Technique; 10] =
        [NakedSingle, HiddenSingleBox, HiddenSingleRow, HiddenSingleCol, Pointing, Claiming, NakedPair, HiddenPair, XWing, YWing];

    /// The id the Python core, the database and the UI use.
    pub fn slug(self) -> &'static str {
        match self {
            NakedSingle => "naked_single",
            HiddenSingleBox => "hidden_single_box",
            HiddenSingleRow => "hidden_single_row",
            HiddenSingleCol => "hidden_single_col",
            Pointing => "pointing",
            Claiming => "claiming",
            NakedPair => "naked_pair",
            HiddenPair => "hidden_pair",
            XWing => "x_wing",
            YWing => "y_wing",
            XChain => "x_chain",
            Aic => "aic",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Step {
    pub technique: Technique,
    pub cell: Option<u8>,
    pub value: Option<u8>,
    pub unit: Option<u8>,
    pub eliminations: Vec<(u8, u8)>, // (cell, digit)
    pub pattern: Vec<u8>,            // cells forming the pattern (for explanations)
    pub chain: Vec<(u8, u8)>,        // (cell, digit) of a chain: the first is off, links strong/weak in turn
}

impl Step {
    pub fn new(technique: Technique) -> Step {
        Step { technique, cell: None, value: None, unit: None, eliminations: vec![], pattern: vec![], chain: vec![] }
    }

    /// The step as JSON with the field names of the Python Step.
    pub fn to_json(&self) -> String {
        fn opt(v: Option<u8>) -> String {
            v.map_or("null".into(), |x| x.to_string())
        }
        fn pairs(v: &[(u8, u8)]) -> String {
            let items: Vec<String> = v.iter().map(|(c, d)| format!("[{c},{d}]")).collect();
            format!("[{}]", items.join(","))
        }
        let pattern: Vec<String> = self.pattern.iter().map(u8::to_string).collect();
        format!(
            r#"{{"technique":"{}","cell":{},"value":{},"unit":{},"eliminations":{},"pattern":[{}],"chain":{}}}"#,
            self.technique.slug(),
            opt(self.cell),
            opt(self.value),
            opt(self.unit),
            pairs(&self.eliminations),
            pattern.join(","),
            pairs(&self.chain)
        )
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct ParseError {
    pub cells: usize,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "нужно 81 клетку, получено {}", self.cells)
    }
}

impl std::error::Error for ParseError {}

/// 81 cells from ASCII digits and dots (0 or . = empty); anything else, such as grid lines, is skipped.
pub fn parse(s: &str) -> Result<Grid, ParseError> {
    let cells: Vec<u8> = s
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.')
        .map(|c| if c == '.' { 0 } else { c as u8 - b'0' })
        .collect();
    Grid::try_from(cells.as_slice()).map_err(|_| ParseError { cells: cells.len() })
}

pub fn to_str(g: &Grid) -> String {
    g.iter().map(|&v| (b'0' + v) as char).collect()
}

#[cfg(test)]
mod testdata;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdata::P;

    #[test]
    fn roundtrip_and_dots() {
        assert_eq!(to_str(&parse(P).unwrap()), P);
        assert_eq!(to_str(&parse(&P.replace('0', ".")).unwrap()), P);
    }

    #[test]
    fn ascii_art() {
        let mut art = Vec::new();
        for r in 0..9 {
            if r == 3 || r == 6 {
                art.push("------+-------+------".to_string());
            }
            let row: Vec<String> = P[r * 9..r * 9 + 9].replace('0', ".").chars().map(String::from).collect();
            art.push(format!("{} | {} | {}", row[..3].join(" "), row[3..6].join(" "), row[6..].join(" ")));
        }
        assert_eq!(to_str(&parse(&art.join("\n")).unwrap()), P);
    }

    #[test]
    fn wrong_length() {
        assert_eq!(parse("123"), Err(ParseError { cells: 3 }));
        assert_eq!(parse("123").unwrap_err().to_string(), "нужно 81 клетку, получено 3");
    }

    #[test]
    fn units_and_peers() {
        assert_eq!(UNITS[18], [0, 1, 2, 9, 10, 11, 18, 19, 20]);
        assert_eq!(UNITS[9], [0, 9, 18, 27, 36, 45, 54, 63, 72]);
        assert_eq!(UNITS[26], [60, 61, 62, 69, 70, 71, 78, 79, 80]);
        assert!(PEER_BITS.iter().all(|b| b.count_ones() == 20));
        assert!(PEERS.iter().all(|p| p.windows(2).all(|w| w[0] < w[1])));
        assert_eq!(PEERS[0][..8], [1, 2, 3, 4, 5, 6, 7, 8]);
        assert_eq!((BOX_OF[0], BOX_OF[40], BOX_OF[80]), (18, 22, 26));
    }

    #[test]
    fn tiers_follow_graded_order() {
        let flat: Vec<Technique> = TIERS.iter().flat_map(|t| t.iter().copied()).collect();
        assert_eq!(flat, Technique::GRADED);
        assert_eq!(Technique::YWing.slug(), "y_wing");
        assert_eq!(Technique::Aic.slug(), "aic");
    }

    #[test]
    fn step_json() {
        let st = Step { cell: Some(4), value: Some(7), pattern: vec![4], ..Step::new(Technique::NakedSingle) };
        assert_eq!(
            st.to_json(),
            r#"{"technique":"naked_single","cell":4,"value":7,"unit":null,"eliminations":[],"pattern":[4],"chain":[]}"#
        );
        assert_eq!(digits(0b10_0000_0110).collect::<Vec<_>>(), [1, 2, 9]);
    }
}
