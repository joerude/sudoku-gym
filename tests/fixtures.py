"""Shared test data: diagnostic puzzles and a deterministic variant generator."""

import random

# (name, givens, solution) — from .claude/skills/sudoku-speed-coach/references/diagnostic-puzzles.md
L1 = [
    (
        "L1-1",
        "100006000600035120032000000000140030860000092050029000000000370013590008000400005",
        "147286953698735124532914867279148536861357492354629781425861379713592648986473215",
    ),
    (
        "L1-2",
        "040090060700600000036700004059000086000108000680000230300007640000005001020030070",
        "542391768718654923936782514459273186273168459681549237395817642867425391124936875",
    ),
    (
        "L1-3",
        "000027090000000074070480200005000760410070089062000400008034050190000000030790000",
        "841527693256913874379486215985341762413672589762859431628134957197265348534798126",
    ),
]
L2 = [
    (
        "L2-1",
        "000030607001002050502060000800090063000000000620070004000020908080600300405080000",
        "948531627361742859572869431857294163194356782623178594736425918289617345415983276",
    ),
    (
        "L2-2",
        "000700000006050840090200075364000900000000000001000364820005030049080700000009000",
        "582746193716953842493218675364521987978634521251897364827165439149382756635479218",
    ),
    (
        "L2-3",
        "008000417000000200570001060100807002002000800700903001020400035004000000851000700",
        "268395417419786253573241968145867392392154876786923541927418635634572189851639724",
    ),
]
L3 = [
    (
        "L3-1",
        "000009050080030000705200001850060200020000010006050043100005304000040060070300000",
        "243619758681537492795284631854163279327498516916752843168975324532841967479326185",
    ),
    (
        "L3-2",
        "000070600000500410800001097153002000000000000000900573910200005062009000004060000",
        "291473658736598412845621397153742986679385124428916573917234865362859741584167239",
    ),
    (
        "L3-3",
        "003100060010000709070490503060940000000000000000075080201089070607000090090002300",
        "953127468416853729872496513165948237784231956329675184241389675637514892598762341",
    ),
]


def variant(givens: str, solution: str, rng: random.Random):
    """Apply a random validity-preserving transform (relabel, band/row/stack/col perms, transpose)."""
    digits = list("123456789")
    rng.shuffle(digits)
    relabel = {"0": "0", **{str(i + 1): d for i, d in enumerate(digits)}}

    def perm3x3():
        bands = [0, 1, 2]
        rng.shuffle(bands)
        out = []
        for b in bands:
            inner = [0, 1, 2]
            rng.shuffle(inner)
            out += [b * 3 + i for i in inner]
        return out

    rows, cols, transpose = perm3x3(), perm3x3(), rng.random() < 0.5

    def apply(s):
        out = []
        for r in range(9):
            for c in range(9):
                rr, cc = rows[r], cols[c]
                if transpose:
                    rr, cc = cc, rr
                out.append(relabel[s[rr * 9 + cc]])
        return "".join(out)

    return apply(givens), apply(solution)


def insert_puzzle(conn, bank_id, level, givens, solution, tech_grade=1):
    cur = conn.execute(
        "INSERT INTO puzzles (bank_id, level, givens, solution, se_rating, tech_grade) VALUES (?, ?, ?, ?, ?, ?)",
        (bank_id, level, givens, solution, 1.0, tech_grade),
    )
    return cur.lastrowid


def seed_variants(conn, n: int, seed: int = 7, level: str = "easy", base=None, tech_grade: int = 1) -> list:
    """Insert n distinct puzzles derived from the diagnostics (L1 by default); returns their ids."""
    base = base or L1
    rng = random.Random(seed)
    ids = []
    for k in range(n):
        _, g, s = base[k % len(base)]
        vg, vs = variant(g, s, rng)
        ids.append(insert_puzzle(conn, f"var-{level}-{seed}-{k}", level, vg, vs, tech_grade))
    conn.commit()
    return ids
