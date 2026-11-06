---
slug: naked-single
title: Naked Single
level: 1
order: 2
drill: naked_single
summary: Exactly one digit fits the cell: the other eight already stand in its row, column or box.
---

# Naked Single

A naked single is a cell where exactly one digit fits: the other eight are already in its row, column or box. Here you think from the cell, not from the digit. The special and easiest case is the last empty cell in a row, column or box (Full House).

## Example

We look for the digit in `r5c5`. Check its three units: row 5, column 5 and box 5.

```sudoku
. . . | . 3 . | . . .
. . . | . . . | . . .
. . . | . 9 . | . . .
------+-------+------
. . . | 4 . . | . . .
2 . 6 | . . . | 1 . 8
. . . | . 7 . | . . .
------+-------+------
. . . | . . . | . . .
. . . | . . . | . . .
. . . | . . . | . . .
unit: r5 c5 b5
ans: r5c5=5
caption: Row 5, column 5 and box 5 together hold 1, 2, 3, 4, 6, 7, 8, 9 — only 5 is left for r5c5.
```

- Row 5 gives 1, 2, 6, 8.
- Box 5 adds 4 and 7 (`r4c4`, `r6c5`).
- Column 5 adds 3 and 9 (the 7 in `r6c5` is already counted).
- Taken: 1, 2, 3, 4, 6, 7, 8, 9. Only 5 is free, so `r5c5 = 5`.

## Spotting it on the board

1. Find a cell that many digits "look at": the crossing of a crowded row and a crowded column, ideally also in a dense box.
2. Read the cell's three units one after another and collect the digits you see: row, column, box.
3. Reached eight different digits — the ninth is yours. Even one short — there is no single.

Another example: `r2c8`.

```sudoku
. . . | . . . | 2 . .
1 . . | 7 3 . | . . .
. . . | . . . | 9 . 6
------+-------+------
. . . | . . . | . . .
. . . | . . . | . . .
. . . | . . . | . 8 .
------+-------+------
. . . | . . . | . . .
. . . | . . . | . . .
. . . | . . . | . 4 .
unit: r2 c8 b3
ans: r2c8=5
caption: Row 2, column 8 and box 3 give 1, 2, 3, 4, 6, 7, 8, 9 — only 5 is left for r2c8.
```

- Row 2 gives 1, 3, 7.
- Column 8 adds 4 and 8.
- Box 3 adds 2, 6 and 9.
- Only 5 is free, so `r2c8 = 5`.

## How it differs from a hidden single

- Naked single: you look at a cell and see that only one digit fits it. Hidden single: you look at a digit and see that it has only one cell left in a unit.
- In a naked single the cell is closed to eight digits. In a hidden single several digits may fit the cell — the single place has to be found for one digit.
- Naked singles appear when units are filled. Hidden singles work on a nearly empty grid too — that is why you start with scanning by digit.
- A cell with two candidates is not a naked single, but there may still be a move: one of the two digits sometimes fits nowhere else in a unit — that is a hidden single.

## How to find them fast

1. Don't look for naked singles on an empty grid — there are almost none; that is the job of scanning by digit. Naked singles appear in the second half of the game.
2. Look at cells where filled units cross: a row with 6–7 digits and a column with 5–6 digits nearly always give a candidate.
3. Full House first: a row, column or box with one empty cell. Zero thinking — place it at once.
4. In a unit with 2–3 empty cells, name the missing digits (say, "no 3, 5, 9"), then for each empty cell check which of them already sit in its other unit. Checking three digits is faster than nine.
5. If you count all nine, count in one order — 1 to 9, ticking "there / not there" to yourself. Random counting leads to misses.

## Typical mistakes

- You checked the row and the column but forgot the box. A digit in a corner of the box slips by easily because it is not in line with the cell.
- Double counting: one digit is both in the row and in the box, you count it twice and wrongly get "eight taken".
- Placing a digit before you finish counting: "everything seems there except 5" — but 3 is missing too. In hardcore such a mistake is not highlighted and surfaces a few moves later as a contradiction.

## Practice

Drill "Naked Single": find the cell where only one digit is possible.

- Before searching, pick the 2–3 fullest units and look only at their crossings.
- For each cell you check, say the unit's missing digits, not the taken ones.
- Time a series of 10 positions; the goal is no mistakes first, then speed. Count a mistake in the series as +10 seconds: in a hardcore game it costs more.
