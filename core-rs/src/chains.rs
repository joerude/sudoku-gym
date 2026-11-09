//! Chains for hints past Y-Wing, as in sudoku_core.py: the shortest X-Chain (one digit) or AIC that removes a
//! candidate. A node is a candidate (cell, digit) numbered cell * 9 + digit - 1, so sorting nodes sorts them by
//! (cell, digit) as Python sorts its tuples.

use crate::techniques::spots;
use crate::{digits, Cands, Step, Technique, PEERS};

pub const MAX_CHAIN: usize = 6; // strong links
const NODES: usize = 729;
const UNSEEN: u16 = u16::MAX;
const ROOT: u16 = u16::MAX - 1;

fn node(cell: u8, v: u8) -> u16 {
    cell as u16 * 9 + v as u16 - 1
}

fn cell_digit(n: u16) -> (u8, u8) {
    ((n / 9) as u8, (n % 9 + 1) as u8)
}

/// A set of nodes; iteration is ascending.
#[derive(Clone, Copy)]
struct NodeSet([u64; 12]);

impl NodeSet {
    const EMPTY: NodeSet = NodeSet([0; 12]);

    fn insert(&mut self, n: u16) {
        self.0[n as usize / 64] |= 1u64 << (n % 64);
    }

    fn remove(&mut self, n: u16) {
        self.0[n as usize / 64] &= !(1u64 << (n % 64));
    }

    fn and(&self, other: &NodeSet) -> NodeSet {
        let mut r = *self;
        for (w, o) in r.0.iter_mut().zip(other.0) {
            *w &= o;
        }
        r
    }

    fn is_empty(&self) -> bool {
        self.0.iter().all(|&w| w == 0)
    }

    fn iter(&self) -> impl Iterator<Item = u16> + '_ {
        self.0.iter().enumerate().flat_map(|(k, &word)| {
            let mut w = word;
            std::iter::from_fn(move || {
                if w == 0 {
                    return None;
                }
                let b = w.trailing_zeros() as u16;
                w &= w - 1;
                Some(k as u16 * 64 + b)
            })
        })
    }
}

/// Node -> nodes that must be on when it is off (ascending, no repeats): the digit's other place in a unit where it
/// has two, and unless one_digit, the other digit of a two-candidate cell.
fn strong_links(cands: &Cands, one_digit: bool) -> Vec<Vec<u16>> {
    let mut links: Vec<Vec<u16>> = vec![Vec::new(); NODES];
    let mut link = |a: u16, b: u16| {
        links[a as usize].push(b);
        links[b as usize].push(a);
    };
    for u in 0..27 {
        for v in 1..=9u8 {
            let s = spots(cands, u, v);
            if let [a, b] = s.as_slice() {
                link(node(*a, v), node(*b, v));
            }
        }
    }
    if !one_digit {
        for i in 0..81u8 {
            let c = cands[i as usize];
            if c.count_ones() == 2 {
                let (x, y) = (c.trailing_zeros() as u8, (15 - c.leading_zeros()) as u8);
                link(node(i, x), node(i, y));
            }
        }
    }
    for l in &mut links {
        l.sort_unstable();
        l.dedup();
    }
    links
}

/// Nodes that are off when n is on: n's digit in its cell's peers and, unless one_digit, its cell's other digits.
fn sees(n: u16, cands: &Cands, one_digit: bool) -> NodeSet {
    let (i, v) = cell_digit(n);
    let mut s = NodeSet::EMPTY;
    for &p in &PEERS[i as usize] {
        if cands[p as usize] & (1 << v) != 0 {
            s.insert(node(p, v));
        }
    }
    if !one_digit {
        for w in digits(cands[i as usize]).filter(|&w| w != v) {
            s.insert(node(i, w));
        }
    }
    s
}

struct Found {
    links: usize,
    chain: Vec<u16>,
    elims: Vec<u16>,
}

/// The shortest chain within `limit` strong links, or None. A chain off -strong-> on -weak-> off … -strong-> on
/// proves «the first or the last is on»: what sees both is off.
fn shortest_chain(cands: &Cands, one_digit: bool, limit: usize) -> Option<Found> {
    let links = strong_links(cands, one_digit);
    let mut best: Option<Found> = None;
    let mut prev_on = vec![UNSEEN; NODES]; // on node -> the off node that turned it on
    let mut prev_off = vec![UNSEEN; NODES]; // off node -> the on node that turned it off
    for start in 0..NODES as u16 {
        if links[start as usize].is_empty() {
            continue;
        }
        let start_sees = sees(start, cands, false);
        prev_on.fill(UNSEEN);
        prev_off.fill(UNSEEN);
        prev_off[start as usize] = ROOT;
        let (mut frontier, mut k) = (vec![start], 0);
        while !frontier.is_empty() && k < best.as_ref().map_or(limit, |b| b.links - 1) {
            k += 1;
            let mut next = Vec::new();
            for &n in &frontier {
                for &m in &links[n as usize] {
                    if prev_on[m as usize] != UNSEEN {
                        continue;
                    }
                    prev_on[m as usize] = n;
                    if m != start && best.as_ref().is_none_or(|b| k < b.links) {
                        let mut both = start_sees.and(&sees(m, cands, false));
                        both.remove(start);
                        both.remove(m);
                        if !both.is_empty() {
                            best = Some(Found {
                                links: k,
                                chain: path(m, &prev_on, &prev_off),
                                elims: both.iter().collect(),
                            });
                        }
                    }
                    for w in sees(m, cands, one_digit).iter() {
                        if prev_off[w as usize] == UNSEEN {
                            prev_off[w as usize] = m;
                            next.push(w);
                        }
                    }
                }
            }
            frontier = next;
        }
    }
    best
}

/// Nodes from the start to m: off, on, off, …, on.
fn path(m: u16, prev_on: &[u16], prev_off: &[u16]) -> Vec<u16> {
    let (mut out, mut on) = (vec![m], m);
    loop {
        let off = prev_on[on as usize];
        out.push(off);
        let back = prev_off[off as usize];
        if back == ROOT {
            break;
        }
        out.push(back);
        on = back;
    }
    out.reverse();
    out
}

/// The shortest chain that removes a candidate; a chain on one digit wins a tie (and is easier to see).
pub fn chain_step(cands: &Cands, limit: usize) -> Option<Step> {
    let one = shortest_chain(cands, true, limit);
    let many = shortest_chain(cands, false, one.as_ref().map_or(limit, |f| f.links - 1));
    let technique = if many.is_some() { Technique::Aic } else { Technique::XChain };
    let found = many.or(one)?;
    let chain: Vec<(u8, u8)> = found.chain.iter().map(|&n| cell_digit(n)).collect();
    let mut pattern = Vec::new();
    for &(c, _) in &chain {
        if !pattern.contains(&c) {
            pattern.push(c);
        }
    }
    Some(Step {
        eliminations: found.elims.iter().map(|&n| cell_digit(n)).collect(),
        pattern,
        chain,
        ..Step::new(technique)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdata::cands_from;
    use crate::Technique;

    #[test]
    fn x_chain() {
        // 1 has two places in row 1 (r1c1, r1c5), column 5 (r1c5, r6c5) and box 5 (r6c5, r4c6), three in
        // column 1: r1c1 or r4c6 is 1 → out of r4c1, which sees both
        let cands = cands_from(&[
            ((1, 1), &[1, 2]),
            ((1, 5), &[1, 3]),
            ((6, 5), &[1, 4]),
            ((4, 6), &[1, 5]),
            ((4, 1), &[1, 6]),
            ((8, 1), &[1, 7]),
        ]);
        let s = chain_step(&cands, MAX_CHAIN).unwrap();
        assert_eq!(s.technique, Technique::XChain);
        assert_eq!(s.eliminations, [(27, 1)]);
        assert_eq!(s.chain, [(0, 1), (4, 1), (49, 1), (32, 1)]);
        assert_eq!(s.pattern, [0, 4, 49, 32]);
    }

    #[test]
    fn aic_through_two_candidate_cells() {
        // r1c1 {1,2} → r1c5 {2,3} → r5c5 {3,1}: r1c1 or r5c5 is 1, and r5c1 sees both; 1 has three places in
        // column 1 and row 5, so no chain on the digit alone
        let cands = cands_from(&[
            ((1, 1), &[1, 2]),
            ((1, 5), &[2, 3]),
            ((5, 5), &[3, 1]),
            ((5, 1), &[1, 7]),
            ((9, 1), &[1, 8]),
            ((5, 9), &[1, 6]),
        ]);
        let s = chain_step(&cands, MAX_CHAIN).unwrap();
        assert_eq!(s.technique, Technique::Aic);
        assert!(s.eliminations.contains(&(36, 1)));
        let mut ds: Vec<u8> = s.chain.iter().map(|&(_, v)| v).collect();
        ds.sort_unstable();
        ds.dedup();
        assert_eq!(ds.len(), 3);
    }

    #[test]
    fn none_without_links() {
        assert_eq!(chain_step(&cands_from(&[((1, 1), &[1, 2, 3]), ((5, 5), &[4, 5, 6])]), MAX_CHAIN), None);
    }
}
