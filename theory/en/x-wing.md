---
slug: x-wing
title: X-Wing
level: 3
order: 8
drill: x_wing
summary: A digit confined to the same two columns in two rows is struck from those columns (or vice versa).
---

# X-Wing

X-Wing is a technique for one digit over four cells that form a rectangle. If in two rows a digit can only go in the same two columns, in those columns it takes exactly those two rows. So the digit can be crossed out of the other cells of those two columns. It works with the roles swapped too: two columns and two shared rows.

## Example

The 4 stands in `r2c8`, `r4c9`, `r7c3`, `r8c6`. In row 1 it has exactly two places: `r1c1` and `r1c4` (`r1c3` and `r1c6` are ruled out by their columns, `r1c7`-`r1c9` by box 3). In row 5 also exactly two: `r5c1` and `r5c4`.

```sudoku
. 1 . | . 9 . | . . .
. . . | . . . | . 4 .
. . . | . . . | . . .
------+-------+------
. . . | . . . | . . 4
. 3 . | . 8 . | . . .
. . . | 5 2 . | . . .
------+-------+------
. . 4 | . . . | . . .
. . . | . . 4 | . . .
. . . | . . . | . . .
unit: r1 r5
pat: r1c1 r1c4 r5c1 r5c4
cand: r1c1=4 r1c4=4 r5c1=4 r5c4=4
elim: r3c1=4 r6c1=4 r3c4=4
ans: r6c2=4
arrow: r1c1>r5c1 r1c4>r5c4
caption: Rows 1 and 5: the 4 goes only in columns 1 and 4, so r3c1, r6c1 and r3c4 have no 4; in row 6 only r6c2 is left
```

The logic has two cases:

- if `r1c1 = 4`, then in column 1 `r5c1` is not 4, so the 4 of row 5 is in `r5c4`;
- if `r1c4 = 4`, then the 4 of row 5 is in `r5c1`.

Either way the fours stand on a diagonal of the rectangle and take columns 1 and 4. So in those columns there is no 4 in any other row: cross it out of `r3c1`, `r6c1`, `r3c4`. Then in row 6 the 4 has only `r6c2` left.

## Spotting it on the board

- Pick a digit with 4-6 copies on the grid and go through the rows: you need those where it has exactly two places.
- Write the places as column numbers: "row 1 — 1 and 4, row 5 — 1 and 4". The same numbers in two rows — a rectangle.
- If the rows give nothing, do the same by columns (rows and columns swap roles).

```sudoku
. . . | . . 4 | . . .
. 3 8 | . . . | 1 . .
. . . | . . . | . . .
------+-------+------
. . . | . . . | . . .
4 . . | . . . | . . .
. . . | . . . | . 4 .
------+-------+------
. . . | . . . | . . .
. 5 . | . . . | 6 . .
. . . | . 4 . | . . .
unit: c2 c7
pat: r3c2 r3c7 r7c2 r7c7
cand: r3c2=4 r3c7=4 r7c2=4 r7c7=4
elim: r3c3=4 r3c9=4 r7c3=4 r7c9=4
ans: r8c3=4
arrow: r3c2>r3c7 r7c2>r7c7
caption: Columns 2 and 7: the 4 goes only in rows 3 and 7, so r3c3, r3c9, r7c3, r7c9 have no 4; in column 3 only r8c3 is left
```

The same idea by columns: the fours are in `r1c6`, `r5c1`, `r6c8`, `r9c5`. In column 2 it has two places — `r3c2` and `r7c2`, in column 7 the same rows 3 and 7. So there is no other 4 in rows 3 and 7: cross out `r3c3`, `r3c9`, `r7c3`, `r7c9`. Then in column 3 the 4 is left only in `r8c3`.

## How it differs from pointing and claiming

- Pointing and claiming work with one box and one line; an X-Wing works with two parallel lines and four corners.
- The idea is the same — the digit's places are squeezed so it has nowhere else to go — but on two lines at once.
- Check pointing and claiming first: they are simpler and quicker to find. Go to X-Wing when they give nothing.

## How to find it fast

1. You don't need an X-Wing while singles, pointing and pairs still work. In medium it is rarely needed — if you are stuck, first make one more 1-9 scan: most often a simple single was missed.
2. Pick a digit with 4-6 copies on the grid: it has few places left, but more than two free rows, so there is something to cross out.
3. Go through the rows and write down those where the digit has exactly two places, as column numbers: "row 1 — 1 and 4, row 5 — 1 and 4". Matching numbers — an X-Wing.
4. If the rows give nothing, do the same for columns.
5. After crossing out, check the rectangle's columns for a hidden single of this digit in the affected boxes.

## Typical mistakes

- Taking a row where the digit has three places. The condition is exactly two places in each of the two rows.
- Crossing out in the wrong place: if the base lines are rows, the columns get cleared, and vice versa.
- Confusing it with pointing: an X-Wing is always about two parallel lines and four corners, not about one box.
- Spending a minute hunting for an X-Wing when the grid has a missed single. Timewise it is the most expensive path.

## Practice

When a medium game is stuck, set yourself a limit: one extra 1-9 scan, then no more than 30 seconds looking for an X-Wing in the two most common digits. Separately, outside games, work through X-Wing positions without a timer and say aloud the column numbers for each row with two places. The goal is to recognise the rectangle from the written numbers, not by eye over the whole grid. In the "X-Wing" drill, find the rectangle first, then the digit to cross out.
