//! Bitmask backtracking, as _search in sudoku_core.py: the cell with the fewest free digits first, digits ascending.

use crate::{Grid, BOX_OF};

struct Search {
    g: Grid,
    rows: [u16; 9],
    cols: [u16; 9],
    boxes: [u16; 9],
    empties: Vec<u8>,
    limit: u32,
    count: u32,
    first: Option<Grid>,
}

/// (number of solutions capped at limit, the first solution).
fn search(g: &Grid, limit: u32) -> (u32, Option<Grid>) {
    let mut s = Search {
        g: *g,
        rows: [0; 9],
        cols: [0; 9],
        boxes: [0; 9],
        empties: Vec::with_capacity(81),
        limit,
        count: 0,
        first: None,
    };
    for i in 0..81 {
        let v = g[i];
        if v == 0 {
            s.empties.push(i as u8);
            continue;
        }
        let bit = 1u16 << v;
        let (r, c, b) = (i / 9, i % 9, BOX_OF[i] as usize - 18);
        if (s.rows[r] | s.cols[c] | s.boxes[b]) & bit != 0 {
            return (0, None);
        }
        s.rows[r] |= bit;
        s.cols[c] |= bit;
        s.boxes[b] |= bit;
    }
    s.rec(0);
    (s.count, s.first)
}

impl Search {
    fn free(&self, i: usize) -> u16 {
        !(self.rows[i / 9] | self.cols[i % 9] | self.boxes[BOX_OF[i] as usize - 18]) & 0x3FE
    }

    fn rec(&mut self, k: usize) {
        if k == self.empties.len() {
            self.count += 1;
            if self.first.is_none() {
                self.first = Some(self.g);
            }
            return;
        }
        let (mut best, mut best_free, mut best_n) = (k, 0u16, 10u32);
        for j in k..self.empties.len() {
            let free = self.free(self.empties[j] as usize);
            let n = free.count_ones();
            if n < best_n {
                (best, best_free, best_n) = (j, free, n);
                if n <= 1 {
                    break;
                }
            }
        }
        if best_n == 0 {
            return;
        }
        self.empties.swap(k, best);
        let i = self.empties[k] as usize;
        let (r, c, b) = (i / 9, i % 9, BOX_OF[i] as usize - 18);
        for v in 1..=9u8 {
            let bit = 1u16 << v;
            if best_free & bit == 0 {
                continue;
            }
            self.g[i] = v;
            self.rows[r] |= bit;
            self.cols[c] |= bit;
            self.boxes[b] |= bit;
            self.rec(k + 1);
            self.rows[r] ^= bit;
            self.cols[c] ^= bit;
            self.boxes[b] ^= bit;
            if self.count >= self.limit {
                break;
            }
        }
        self.g[i] = 0;
        self.empties.swap(k, best);
    }
}

/// Number of solutions, stopping at limit.
pub fn count_solutions(g: &Grid, limit: u32) -> u32 {
    search(g, limit).0
}

/// The first solution, if any.
pub fn solve(g: &Grid) -> Option<Grid> {
    search(g, 1).1
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdata::{P, S};
    use crate::{parse, to_str};

    #[test]
    fn solve_and_uniqueness() {
        assert_eq!(to_str(&solve(&parse(P).unwrap()).unwrap()), S);
        assert_eq!(count_solutions(&parse(P).unwrap(), 2), 1);
        assert_eq!(count_solutions(&[0; 81], 2), 2);
    }

    #[test]
    fn contradiction() {
        let mut g = parse(P).unwrap();
        g[1] = 1; // duplicate 1 in row 1
        assert_eq!(solve(&g), None);
        assert_eq!(count_solutions(&g, 2), 0);
    }
}
