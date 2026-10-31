---
slug: naked-single
title: Naked Single
level: 1
order: 2
drill: naked_single
---

# Naked Single

A naked single is a cell where exactly one digit fits: the other eight are already in its row, column or box. Here you think from the cell, not from the digit. The special and easiest case is the last empty cell in a row, column or box (Full House).

## Example

We look for the digit in `r5c5`. Check its three units.

Row 5 (`?` is the cell we want):

```
2 . 6 | . ? . | 1 . 8
```

Box 5 (rows 4–6, columns 4–6):

```
4 . .
. ? .
. 7 .
```

Column 5, top to bottom:

```
3 . 9 | . ? 7 | . . .
```

- The row gives 1, 2, 6, 8.
- The box adds 4 and 7.
- The column adds 3 and 9 (the 7 is already counted).
- Taken: 1, 2, 3, 4, 6, 7, 8, 9. Only 5 is free, so `r5c5 = 5`.

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

Drill `naked_single`: find the cell where only one digit is possible.

- Before searching, pick the 2–3 fullest units and look only at their crossings.
- For each cell you check, say the unit's missing digits, not the taken ones.
- Time a series of 10 positions; the goal is no mistakes first, then speed. Count a mistake in the series as +10 seconds: in a hardcore game it costs more.
