---
slug: hidden-pair
title: Hidden Pair/Triple
level: 3
order: 7
drill: hidden_pair
summary: Two digits sharing the same two places in a unit own those cells; cross out their other candidates.
---

# Hidden Pair/Triple

Hidden pair: two digits that have the same two possible places in a unit. Those cells are taken by these two digits, so every other candidate is crossed out of them. The pair is "hidden" because the cells hold extra candidates besides it. Hidden triple: three digits that can go only in three cells of a unit.

## Example

Row 4, full candidates:

```sudoku
. . . | . . . | . . .
. . . | . . . | . . .
. . . | . . . | . . .
------+-------+------
. . 9 | . 6 5 | . . .
. 1 2 | . 8 . | 3 7 .
. . . | 7 . . | . 8 .
------+-------+------
. . . | . . . | . . .
. . . | . . . | . . .
. . . | . . . | . . .
unit: r4
pat: r4c1 r4c2
cand: r4c1=3478 r4c2=3478 r4c7=124 r4c8=124 r4c9=124
elim: r4c1=34 r4c2=34
ans: r4c4=3
caption: Row 4: 7 and 8 go only in r4c1 and r4c2 — a hidden pair; 3 and 4 are struck from them, so 3 is left only in r4c4
```

- `r4c1` — `{3,4,7,8}`
- `r4c2` — `{3,4,7,8}`
- `r4c4` — `{1,2,3,4}`
- `r4c7`, `r4c8`, `r4c9` — `{1,2,4}`

No singles. But 7 appears only in `r4c1` and `r4c2`, and so does 8. That is a hidden pair `{7,8}`: 3 and 4 are crossed out of both cells, and they become `{7,8}`.

After the cleanup the 3 of the row is left only in `r4c4`: `r4c4 = 3`. The other four cells (`r4c4`, `r4c7`, `r4c8`, `r4c9`) together hold only `{1,2,3,4}` — a naked quad, the flip side of the same pair.

## Link to Snyder notation

With Snyder notes a hidden pair shows without writing candidates: if in a box the marks of 3 and 8 are in the same two cells, that is a hidden pair. Nothing else goes into those cells — leave them out when looking for places for the other digits of the box.

## Spotting it on the board

- Pick a box or row with 5-6 empty cells and name the missing digits.
- For each digit find its places. Write down the digits with exactly two places as pairs of cells.
- The same pair of cells for two digits is a hidden pair. Cross everything else out of those cells.

```sudoku
. 7 4 | . . . | . . .
. . . | . . . | . . .
. . . | . . . | . . .
------+-------+------
3 1 . | . . . | . . .
6 . . | . . . | . . .
. . . | . . . | . . .
------+-------+------
2 . 8 | . . . | . . .
. . 3 | . . . | . . .
. . 5 | . . . | . . 4
unit: b7
pat: r8c1 r9c1
cand: r7c2=469 r8c1=1479 r8c2=469 r9c1=179 r9c2=69
elim: r8c1=49 r9c1=9
ans: r6c1=4
caption: Box 7: 1 and 7 go only in r8c1 and r9c1; after the cleanup the 4 of column 1 is left only in r6c1
```

Box 7: 1 appears only in `r8c1` and `r9c1`, and so does 7. 4 and 9 leave `r8c1`, 9 leaves `r9c1`. The other three cells of the box (`r7c2`, `r8c2`, `r9c2`) together hold only `{4,6,9}` — a naked triple. And in column 1 the 4 is left only in `r6c1`: `r8c1` lost it, `r1c1`-`r3c1` are ruled out by the 4 in `r1c3`, `r9c1` by the 4 in `r9c9`.

## How it differs from a naked pair

- A naked pair is seen by cells: two cells with the same two digits. A hidden pair is seen by digits: two digits with the same two places.
- A naked pair clears the other cells of the unit. A hidden pair clears the extras inside the pair's own cells.
- After the cleanup a hidden pair becomes a naked one, and the rest of the unit often forms a naked group (triple, quad) — as in both examples.

## How to find them fast

1. Don't go through cells — go through digits. For a unit, name the missing digits and count the places of each. Remember the digits with two places as pairs of cells.
2. If two digits gave the same pair of cells, the hidden pair is found.
3. Hidden and naked groups complement each other: if a unit has 6 empty cells and a hidden pair, the other 4 cells form a naked quad. Look for whichever is smaller.
4. Check for a hidden triple only when there are neither pairs nor pointing: take three digits with 2-3 places and check whether all their places fit into three cells.
5. Right after crossing out, check the neighbouring units of the pair's cells — a hidden single often opens there.

## Typical mistakes

- Seeing one digit with two places and calling it a pair. You need two digits with the same two places.
- Forgetting to cross the extra candidates out of the pair's cells. Without that the technique gives nothing.
- Looking for hidden groups with incomplete candidates. A hidden pair in a row requires knowing every place of the digit in the row, not only the box marks.

## Practice

Take a unit with 5-6 empty cells in a medium game where the singles have run out. For each missing digit, name its places in one phrase: "7 — first and second, 8 — first and second". Saying it aloud makes you compare pairs of cells, not cells. Time each unit; when the time is steady, do the same with Snyder marks in boxes, without writing candidates. Train the "Hidden Pair" drill separately.
