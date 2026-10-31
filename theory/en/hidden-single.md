---
slug: hidden-single
title: Hidden Single
level: 1
order: 3
drill: hidden_single_row
---

# Hidden Single

A hidden single is a digit that has only one possible place left in a unit (box, row or column). Other digits may fit in that cell too, but this digit has nowhere else to go in the unit. Scanning by digit is a search for hidden singles in boxes; here we also cover rows and columns.

## Example in a row

We look for 5 in row 4. The fives on the grid are in `r1c4`, `r2c9`, `r6c2`, `r8c5`.

```
r4:  3 . 7 | . . 1 | . 9 .
```

- `r4c2` — box 4 already has a 5 (`r6c2`).
- `r4c4` — column 4 has a 5 (`r1c4`).
- `r4c5` — column 5 has a 5 (`r8c5`).
- `r4c9` — column 9 has a 5 (`r2c9`).
- `r4c7` is left, so `r4c7 = 5`.

After the eliminations the row looks like this (`x` — ruled out):

```
r4:  3 x 7 | x x 1 | 5 9 x
```

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

Drill `hidden_single_row`: find the digit that has one place in a row.

- First pick the row with the fewest empty cells, then a digit it lacks.
- Run your eye down the columns of the empty cells in one motion, without going back.
- When a series of 10 positions goes without mistakes, repeat the same trick for columns — look along the rows from left to right.
