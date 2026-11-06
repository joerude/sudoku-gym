---
slug: naked-pair
title: Naked Pair/Triple
level: 3
order: 6
drill: naked_pair
summary: Two cells of a unit with the same two candidates own them; cross them out of the other cells.
---

# Naked Pair/Triple

Naked pair: two cells of one unit, each with exactly the same two candidates, say `{2,4}` and `{2,4}`. These two digits will take these two cells, so 2 and 4 are crossed out of the other cells of the unit. Naked triple: three cells that together hold only three digits; each cell may have two or three of them.

## Example: a pair

Row 4, the candidates of the empty cells are written out in full:

```sudoku
. . . | . . . | 1 . .
. . . | . . 5 | . . .
. . . | . . . | . . .
------+-------+------
2 . . | . 8 . | . 3 4
6 . 9 | . . . | . . .
. 7 . | . . 6 | . . .
------+-------+------
. . . | . . . | . . .
. . . | . . . | . . .
. . . | . . 9 | . . .
unit: r4
pat: r4c2 r4c3
cand: r4c2=15 r4c3=15 r4c4=1579 r4c6=17 r4c7=5679
elim: r4c4=15 r4c6=1 r4c7=5
caption: Row 4: the pair {1,5} in r4c2 and r4c3 strikes 1 and 5 from r4c4, r4c6, r4c7; r4c6 is left with 7
```

- `r4c2` — `{1,5}`
- `r4c3` — `{1,5}`
- `r4c4` — `{1,5,7,9}`
- `r4c6` — `{1,7}`
- `r4c7` — `{5,6,7,9}`

No singles, but `r4c2` and `r4c3` are a naked pair `{1,5}`. Cross 1 and 5 out of the other cells of the row:

- `r4c4` becomes `{7,9}`;
- `r4c6` becomes `{7}` — place `r4c6 = 7`;
- `r4c7` becomes `{6,7,9}`.

Both cells of the pair are also in box 4, so 1 and 5 are crossed out of the rest of that box too: `r5c2`, `r6c1`, `r6c3`.

## Example: a triple

A column with six empty cells: `{1,5}`, `{5,8}`, `{1,8}`, `{1,3,9}`, `{5,7,9}`, `{3,7,8}`. The first three cells together hold only 1, 5, 8 — a naked triple. The others shrink to `{3,9}`, `{7,9}`, `{3,7}`.

## Spotting it on the board

- Find cells with exactly two candidates. You need a second identical one in the same row, column or box.
- A pair often sits in a box on one row or one column — then clear both units at once.
- Cross the two digits out of the rest of the unit and look right away whether some cell is left with a single digit.

```sudoku
. 6 . | 7 . 1 | 5 . .
1 7 . | . . . | 4 . 8
. . 2 | . . . | 3 . .
------+-------+------
. . . | . . . | . . .
. . . | . . . | . . .
. . . | . . . | . . .
------+-------+------
. . . | . . . | . . .
. . . | . . . | . . .
. . . | . . . | . . .
unit: b3
pat: r1c8 r1c9
cand: r1c8=29 r1c9=29 r2c8=269 r3c8=1679 r3c9=1679
elim: r2c8=29 r3c8=9 r3c9=9
caption: Box 3: the pair {2,9} in r1c8 and r1c9 clears the rest of the box; r2c8 is left with just 6
```

Box 3: `r1c8` and `r1c9` are `{2,9}`. The other cells of the box lose 2 and 9: `r2c8` goes from `{2,6,9}` to `{6}`, `r3c8` and `r3c9` become `{1,6,7}`. The pair is in row 1 too, so 9 is also crossed out of `r1c1`, `r1c3`, `r1c5`, and 2 out of `r1c5`.

## How it differs from a hidden pair

- A naked pair is seen by cells: two cells, each with just two digits, the same ones. You clear the other cells of the unit.
- A hidden pair is seen by digits: two digits that have the same two places in the unit, but those cells hold extra candidates. You clear the extras inside the pair's own cells.
- After the cleanup a hidden pair becomes a naked one: its cells are left with the same two digits.

## How to find them fast

1. Look for naked pairs only where the candidates are known in full. Snyder marks are not a full list. Write full candidates only in a unit with 3-5 empty cells left.
2. Look for cells with two candidates and check their row, column and box at once: is there a second cell with the same pair?
3. If the two cells of a pair are in one box and on one line, clear both units.
4. Look for a triple only if there are no pairs: take a unit with 5-6 empty cells and check whether three cells cover just three digits.
5. After clearing, check at once whether some cell has become a naked single. That is the goal.

## Typical mistakes

- Taking cells from different units for a pair. `{2,4}` in `r7c1` and `{2,4}` in `r5c9` give nothing: they share no row, column or box.
- Building a pair from incomplete notes. If a 6 is really still possible in a cell and you did not write it, the conclusion is false — in hardcore this leads to a mistake you won't see.
- Thinking every cell of a triple must hold all three digits. `{1,5}`, `{5,8}`, `{1,8}` is a full triple.
- Crossing the pair's digits out of the pair's own cells.

## Practice

At the end of every medium game, when 10-15 empty cells remain, write full candidates in one unit with 4-5 empty cells and find a pair in it by hand, without looking at the rest of the grid. Time it from writing to the move. The goal: writing candidates in one unit takes a few seconds and does not turn into marking up the whole grid. Run the "Naked Pair" drill separately: it trains you to spot two identical cells fast.
