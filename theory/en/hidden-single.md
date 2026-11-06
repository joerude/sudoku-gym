---
slug: hidden-single
title: Hidden Single
level: 1
order: 3
drill: hidden_single_row
summary: A digit has one place left in a unit — place it even if other digits fit that cell too.
---

# Hidden Single

A hidden single is a digit that has only one possible place left in a unit (box, row or column). Other digits may fit in that cell too, but this digit has nowhere else to go in the unit. Scanning by digit is a search for hidden singles in boxes; here we also cover rows and columns.

## Example in a row

We look for 5 in row 4. The fives on the grid are in `r1c4`, `r2c9`, `r5c1`, `r8c5`.

```sudoku
. . . | 5 . . | . . .
. . . | . . . | . . 5
. . . | . . . | . . .
------+-------+------
3 . 7 | . . 1 | . 9 .
5 . . | . . . | . . .
. . . | . . . | . . .
------+-------+------
. . . | . . . | . . .
. . . | . 5 . | . . .
. . . | . . . | . . .
unit: r4
x: r4c2 r4c4 r4c5 r4c9
ans: r4c7=5
arrow: r5c1>r4c2 r1c4>r4c4 r8c5>r4c5 r2c9>r4c9
caption: The fives close r4c2, r4c4, r4c5, r4c9 — only r4c7 is left for 5 in row 4.
```

- `r4c2` — box 4 already has a 5 (`r5c1`).
- `r4c4` — column 4 has a 5 (`r1c4`).
- `r4c5` — column 5 has a 5 (`r8c5`).
- `r4c9` — column 9 has a 5 (`r2c9`).
- The other cells of the row are filled. `r4c7` is left, so `r4c7 = 5`.

## Spotting it on the board

1. Pick a line (row or column) with 3–4 empty cells and a digit it lacks.
2. Find all copies of the digit on the grid. Each copy standing in the column (for a row) or the row (for a column) of an empty cell closes that cell.
3. Don't forget the box: a copy in a box of the line closes up to three of its cells at once.
4. If one cell is left open, that is a move, even when other digits fit there too.

Example in a column: we look for 8 in column 6.

```sudoku
. 8 . | . . . | . . .
. . . | . . 4 | . . .
. . . | . . . | . 8 .
------+-------+------
. . . | . . . | . . .
8 . . | . . . | . . .
. . . | . . 2 | . . .
------+-------+------
. . . | . . . | . . .
. . . | 8 . . | . . .
. . . | . . . | . . .
unit: c6
x: r1c6 r3c6 r5c6 r7c6 r8c6 r9c6
ans: r4c6=8
arrow: r1c2>r1c6 r3c8>r3c6 r5c1>r5c6 r8c4>r8c6 r8c4>r7c6 r8c4>r9c6
caption: The eights close r1c6, r3c6, r5c6 and r8c6 by their rows, and r7c6 and r9c6 by box 8: r4c6 is left.
```

- `r2c6` and `r6c6` are filled.
- Rows close `r1c6` (8 in `r1c2`), `r3c6` (`r3c8`), `r5c6` (`r5c1`) and `r8c6` (`r8c4`).
- The 8 in `r8c4` is in box 8 and closes `r7c6` and `r9c6` as well.
- `r4c6` is left, so `r4c6 = 8`.

## How it differs from a naked single

- Naked single: one digit fits the cell. Hidden single: the digit fits one cell of the unit.
- A hidden single can sit in a cell where several digits fit. That is exactly why it is easy to miss when you look only at cells.

```sudoku
. . 3 | . . . | . . .
. 5 . | . . . | . . .
. . . | . . . | . . .
------+-------+------
. . . | . . . | . . .
6 . . | . . . | . 5 .
1 . . | 4 . 8 | . . 9
------+-------+------
. . . | . . . | . . .
. . 7 | . 5 . | . . .
. . . | . . . | . . .
unit: r6
x: r6c2 r6c5 r6c7 r6c8
cand: r6c3=25
arrow: r2c2>r6c2 r8c5>r6c5 r5c8>r6c7 r5c8>r6c8
caption: Both 2 and 5 fit r6c3, so it is not a naked single, but 5 has nowhere else in row 6: r6c3 = 5.
```

- Both 2 and 5 fit `r6c3`, but 5 is closed in `r6c2`, `r6c5`, `r6c7` and `r6c8`. The 2 has other places to go, the 5 does not.
- So "two candidates — no move" is wrong here: place the 5.

## How to find them fast

1. Order: boxes → rows → columns. In a box all cells are close together and the eye takes them in at once; a row or column has to be followed through three boxes.
2. In a row or column, take a unit with 3–4 empty cells. Name the missing digits and check each one: where can it go.
3. For a row, look vertically: each empty cell is ruled out if its column has the digit. Add boxes: the digit in the same box rules out three cells of the row at once.
4. For a column — the same, but look horizontally along the rows.
5. After a move, repeat the check in the neighbouring rows of the same band: the same digit now rules out one more line.

## Typical mistakes

- Confusing a hidden single with a naked one: "2 and 5 both fit the cell, so there is no move". Wrong — if 5 has nowhere else to go in the row, place the 5.
- Ruling a cell out only by its column and forgetting that the digit in the same box rules it out too. Without the box you see two places where there is really one.
- Placing a digit from the row without checking its column. In hardcore, check all three units before entering: row, column, box.
- Starting with rows on an empty grid. While there are few digits, boxes give more moves.

## Practice

Drills "Hidden Single in a row" and "Hidden Single in a column": find the digit that has one place in a line.

- First pick the row with the fewest empty cells, then a digit it lacks.
- Run your eye down the columns of the empty cells in one motion, without going back.
- When a series of 10 positions goes without mistakes, repeat the same trick for columns — look along the rows from left to right.
