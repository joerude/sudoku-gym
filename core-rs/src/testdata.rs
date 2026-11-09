//! Grids and helpers shared by the unit tests (the same as tests/test_core.py).
use crate::Cands;

pub const P: &str = "100006000600035120032000000000140030860000092050029000000000370013590008000400005";
pub const S: &str = "147286953698735124532914867279148536861357492354629781425861379713592648986473215";
pub const L2: &str = "000030607001002050502060000800090063000000000620070004000020908080600300405080000";
pub const L3: &str = "000009050080030000705200001850060200020000010006050043100005304000040060070300000";

/// Candidates where only the listed cells have any: ((row, col) from 1, digits).
pub fn cands_from(cells: &[((usize, usize), &[u8])]) -> Cands {
    let mut cands = [0u16; 81];
    for &((r, c), vs) in cells {
        cands[(r - 1) * 9 + c - 1] = vs.iter().fold(0, |m, &v| m | 1 << v);
    }
    cands
}
