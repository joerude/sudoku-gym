//! Candidates and the ten named techniques, as in sudoku_core.py and in the same scan order, so the same steps
//! come out in the same order.

use crate::Technique::{self, *};
use crate::{digits, Cands, Grid, Step, BOX_OF, PEERS, PEER_BITS, TIERS, UNITS};

pub fn candidates(g: &Grid) -> Cands {
    let mut cands = [0u16; 81];
    for i in 0..81 {
        if g[i] == 0 {
            cands[i] = PEERS[i].iter().fold(0x3FE, |m, &p| m & !(1 << g[p as usize]));
        }
    }
    cands
}

/// Cells of a unit where a digit is a candidate, in unit order.
#[derive(Clone, Copy)]
pub(crate) struct Spots {
    cells: [u8; 9],
    len: usize,
}

impl Spots {
    pub(crate) fn as_slice(&self) -> &[u8] {
        &self.cells[..self.len]
    }
}

pub(crate) fn spots(cands: &Cands, u: usize, v: u8) -> Spots {
    let mut s = Spots { cells: [0; 9], len: 0 };
    for &i in &UNITS[u] {
        if cands[i as usize] & (1 << v) != 0 {
            s.cells[s.len] = i;
            s.len += 1;
        }
    }
    s
}

/// All steps in this position for the given techniques. Chains are not here: they come from chain_step.
pub fn find_steps(cands: &Cands, techniques: &[Technique]) -> Vec<Step> {
    let mut steps = Vec::new();
    for &t in techniques {
        match t {
            NakedSingle => naked_singles(cands, &mut steps),
            HiddenSingleBox | HiddenSingleRow | HiddenSingleCol => hidden_singles(cands, t, &mut steps),
            Pointing | Claiming => locked(cands, t, &mut steps),
            NakedPair => naked_pairs(cands, &mut steps),
            HiddenPair => hidden_pairs(cands, &mut steps),
            XWing => x_wings(cands, &mut steps),
            YWing => y_wings(cands, &mut steps),
            XChain | Aic => panic!("find_steps does not look for chains: {}", t.slug()),
        }
    }
    steps
}

/// The steps of the lowest tier that has any.
pub fn easiest_steps(cands: &Cands) -> Vec<Step> {
    for tier in TIERS {
        let steps = find_steps(cands, tier);
        if !steps.is_empty() {
            return steps;
        }
    }
    Vec::new()
}

fn naked_singles(cands: &Cands, steps: &mut Vec<Step>) {
    for i in 0..81u8 {
        let c = cands[i as usize];
        if c.count_ones() == 1 {
            let v = c.trailing_zeros() as u8;
            steps.push(Step { cell: Some(i), value: Some(v), pattern: vec![i], ..Step::new(NakedSingle) });
        }
    }
}

fn hidden_singles(cands: &Cands, t: Technique, steps: &mut Vec<Step>) {
    let units = match t {
        HiddenSingleRow => 0..9,
        HiddenSingleCol => 9..18,
        _ => 18..27,
    };
    for u in units {
        for v in 1..=9u8 {
            let s = spots(cands, u, v);
            if s.len == 1 {
                steps.push(Step {
                    cell: Some(s.cells[0]),
                    value: Some(v),
                    unit: Some(u as u8),
                    pattern: s.as_slice().to_vec(),
                    ..Step::new(t)
                });
            }
        }
    }
}

/// Pointing: a digit in a box confined to one line; claiming: in a line confined to one box.
fn locked(cands: &Cands, t: Technique, steps: &mut Vec<Step>) {
    let sources = if t == Pointing { 18..27 } else { 0..18 };
    for u in sources {
        for v in 1..=9u8 {
            let s = spots(cands, u, v);
            let sp = s.as_slice();
            if sp.len() < 2 {
                continue;
            }
            let first = sp[0] as usize;
            let (mut targets, mut n) = ([0usize; 2], 0);
            if t == Pointing {
                for w in [first / 9, 9 + first % 9] {
                    if sp.iter().all(|c| UNITS[w].contains(c)) {
                        targets[n] = w;
                        n += 1;
                    }
                }
            } else if sp.iter().all(|&c| BOX_OF[c as usize] == BOX_OF[first]) {
                targets[0] = BOX_OF[first] as usize;
                n = 1;
            }
            for &w in &targets[..n] {
                let elim: Vec<(u8, u8)> = UNITS[w]
                    .iter()
                    .filter(|&&i| !sp.contains(&i) && cands[i as usize] & (1 << v) != 0)
                    .map(|&i| (i, v))
                    .collect();
                if !elim.is_empty() {
                    steps.push(Step { unit: Some(u as u8), eliminations: elim, pattern: sp.to_vec(), ..Step::new(t) });
                }
            }
        }
    }
}

fn naked_pairs(cands: &Cands, steps: &mut Vec<Step>) {
    for u in 0..27 {
        let empty: Vec<u8> = UNITS[u].iter().copied().filter(|&i| cands[i as usize] != 0).collect();
        for (k, &a) in empty.iter().enumerate() {
            for &b in &empty[k + 1..] {
                let ca = cands[a as usize];
                if ca.count_ones() != 2 || ca != cands[b as usize] {
                    continue;
                }
                let mut elim = Vec::new();
                for &i in &empty {
                    if i != a && i != b {
                        elim.extend(digits(ca).filter(|&v| cands[i as usize] & (1 << v) != 0).map(|v| (i, v)));
                    }
                }
                if !elim.is_empty() {
                    steps.push(Step {
                        unit: Some(u as u8),
                        eliminations: elim,
                        pattern: vec![a, b],
                        ..Step::new(NakedPair)
                    });
                }
            }
        }
    }
}

fn hidden_pairs(cands: &Cands, steps: &mut Vec<Step>) {
    for u in 0..27 {
        for x in 1..=9u8 {
            for y in x + 1..=9u8 {
                let sx = spots(cands, u, x);
                if sx.len != 2 || sx.as_slice() != spots(cands, u, y).as_slice() {
                    continue;
                }
                let keep = (1u16 << x) | (1u16 << y);
                let elim: Vec<(u8, u8)> = sx
                    .as_slice()
                    .iter()
                    .flat_map(|&i| digits(cands[i as usize] & !keep).map(move |v| (i, v)))
                    .collect();
                if !elim.is_empty() {
                    steps.push(Step {
                        unit: Some(u as u8),
                        eliminations: elim,
                        pattern: sx.as_slice().to_vec(),
                        ..Step::new(HiddenPair)
                    });
                }
            }
        }
    }
}

fn col_of(i: u8) -> usize {
    9 + i as usize % 9
}

fn row_of(i: u8) -> usize {
    i as usize / 9
}

/// Base lines: rows (cover = columns), then columns (cover = rows).
fn x_wings(cands: &Cands, steps: &mut Vec<Step>) {
    for (base, cover) in [(0..9, col_of as fn(u8) -> usize), (9..18, row_of as fn(u8) -> usize)] {
        for v in 1..=9u8 {
            let mut lines: Vec<([u8; 2], [usize; 2])> = Vec::new();
            for u in base.clone() {
                let s = spots(cands, u, v);
                if s.len == 2 {
                    let sp = [s.cells[0], s.cells[1]];
                    lines.push((sp, [cover(sp[0]), cover(sp[1])]));
                }
            }
            for (k, (s1, c1)) in lines.iter().enumerate() {
                for (s2, c2) in &lines[k + 1..] {
                    if c1 != c2 {
                        continue;
                    }
                    let corners = [s1[0], s1[1], s2[0], s2[1]];
                    let mut elim = Vec::new();
                    for &w in c1 {
                        for &i in &UNITS[w] {
                            if !corners.contains(&i) && cands[i as usize] & (1 << v) != 0 {
                                elim.push((i, v));
                            }
                        }
                    }
                    if !elim.is_empty() {
                        let mut pattern = corners.to_vec();
                        pattern.sort_unstable();
                        steps.push(Step { eliminations: elim, pattern, ..Step::new(XWing) });
                    }
                }
            }
        }
    }
}

/// Pivot p {x, y}; pincer a {x, z} and pincer b {y, z} among its peers: z is off where a and b both see.
/// Eliminations come ascending (Python walks a frozenset in hash order; parity compares them sorted).
fn y_wings(cands: &Cands, steps: &mut Vec<Step>) {
    let bivalue: Vec<u8> = (0..81u8).filter(|&i| cands[i as usize].count_ones() == 2).collect();
    for &p in &bivalue {
        let cp = cands[p as usize];
        let (x, y) = (cp.trailing_zeros() as u8, (15 - cp.leading_zeros()) as u8);
        let wings: Vec<u8> = bivalue.iter().copied().filter(|&i| (PEER_BITS[p as usize] >> i) & 1 == 1).collect();
        for &a in &wings {
            let ca = cands[a as usize];
            if ca & (1 << x) == 0 || ca & (1 << y) != 0 {
                continue;
            }
            let z = (ca & !(1u16 << x)).trailing_zeros() as u8;
            for &b in &wings {
                if b == a || cands[b as usize] != (1u16 << y) | (1u16 << z) {
                    continue;
                }
                let both = PEER_BITS[a as usize] & PEER_BITS[b as usize];
                let elim: Vec<(u8, u8)> = (0..81u8)
                    .filter(|&i| i != p && (both >> i) & 1 == 1 && cands[i as usize] & (1 << z) != 0)
                    .map(|i| (i, z))
                    .collect();
                if !elim.is_empty() {
                    steps.push(Step { eliminations: elim, pattern: vec![p, a, b], ..Step::new(YWing) });
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdata::{cands_from, L2, L3, P};
    use crate::{parse, solve};

    fn assert_steps_valid(puzzle: &str) {
        let g = parse(puzzle).unwrap();
        let sol = solve(&g).unwrap();
        let steps = find_steps(&candidates(&g), &Technique::GRADED);
        assert!(!steps.is_empty());
        for st in &steps {
            if let Some(c) = st.cell {
                assert_eq!(Some(sol[c as usize]), st.value, "{st:?}");
            }
            for &(c, v) in &st.eliminations {
                assert_ne!(sol[c as usize], v, "{st:?}");
            }
        }
    }

    #[test]
    fn all_steps_agree_with_solution() {
        for p in [P, L2, L3] {
            assert_steps_valid(p);
        }
    }

    #[test]
    fn candidates_of_a_cell() {
        let c = candidates(&parse(P).unwrap());
        assert_eq!(c[0], 0); // r1c1 is given
        assert_eq!(digits(c[1]).collect::<Vec<_>>(), [4, 7, 8, 9]); // r1c2: row 1 6, col 2 3 5 6 1, box 1 6 3 2
    }

    #[test]
    fn hidden_single_box_unit() {
        let steps = find_steps(&candidates(&parse(P).unwrap()), &[Technique::HiddenSingleBox]);
        assert!(!steps.is_empty());
        for s in &steps {
            assert_eq!(s.unit, Some(BOX_OF[s.cell.unwrap() as usize]));
        }
    }

    #[test]
    fn easiest_is_tier_one_on_l1() {
        let steps = easiest_steps(&candidates(&parse(P).unwrap()));
        assert!(!steps.is_empty());
        assert!(steps.iter().all(|s| TIERS[0].contains(&s.technique)));
    }

    #[test]
    fn x_wing_rows() {
        // 4 only in c2/c7 of rows 2 and 8 → remove 4 from c2/c7 elsewhere
        let cands = cands_from(&[
            ((2, 2), &[4, 5]),
            ((2, 7), &[4, 6]),
            ((8, 2), &[4, 7]),
            ((8, 7), &[4, 9]),
            ((5, 2), &[4, 1]),
            ((5, 5), &[4, 3]),
            ((6, 7), &[4, 8]),
        ]);
        let mut elims: Vec<(u8, u8)> =
            find_steps(&cands, &[Technique::XWing]).into_iter().flat_map(|s| s.eliminations).collect();
        elims.sort_unstable();
        elims.dedup();
        assert_eq!(elims, [(4 * 9 + 1, 4), (5 * 9 + 6, 4)]);
    }

    #[test]
    fn y_wing() {
        // pivot r1c1 {1,2}, pincers r1c5 {1,9} (row) and r3c2 {2,9} (box) → 9 out of cells seeing both
        let cands = cands_from(&[
            ((1, 1), &[1, 2]),
            ((1, 5), &[1, 9]),
            ((3, 2), &[2, 9]),
            ((3, 5), &[9, 7]),
            ((1, 3), &[9, 4]),
            ((7, 7), &[9, 3]),
        ]);
        let elims: Vec<(u8, u8)> =
            find_steps(&cands, &[Technique::YWing]).into_iter().flat_map(|s| s.eliminations).collect();
        assert!(elims.contains(&(2 * 9 + 4, 9))); // r3c5 sees r1c5 (col) and r3c2 (row)
        assert!(!elims.contains(&(6 * 9 + 6, 9))); // r7c7 sees neither
    }
}
