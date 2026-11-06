---
slug: pointing-claiming
title: Pointing and Claiming
level: 2
order: 5
drill: pointing
summary: A digit's places in a box on one line clear that line; places on a line in one box clear the box.
---

# Pointing and Claiming

Both techniques work where a box crosses a line (a row or a column). Pointing pair/triple: if inside a box a digit can only go in one row (or column), it cannot be in that row outside the box. Claiming (Box-Line Reduction) is the reverse: if in a row (or column) a digit can only go inside one box, it cannot be in the other cells of that box.

## Example: a pointing triple

The threes on the grid are in `r2c9`, `r5c5`, `r8c7`. Row 6 of box 4 is filled (`1 7 4`).

```sudoku
. . . | . . . | . . .
. . . | . . . | . . 3
. . . | . . . | . . .
------+-------+------
. . . | . . . | . . .
. . . | . 3 . | . . .
1 7 4 | . . . | . . .
------+-------+------
. . . | . . . | . . .
. . . | . . . | 3 . .
. . . | . . . | . . .
unit: b4
pat: r4c1 r4c2 r4c3
x: r5c1 r5c2 r5c3
cand: r4c1=3 r4c2=3 r4c3=3
elim: r4c8=3
ans: r6c8=3
arrow: r4c1>r4c8
caption: Box 4: the 3 can only go in row 4, so r4c8 has no 3; in box 6 only r6c8 is left
```

1. Box 4: row 5 is ruled out by the 3 in `r5c5`. Row 4 is left, so the 3 of box 4 is in `r4c1`, `r4c2` or `r4c3`.
2. Pointing: there is no 3 in row 4 outside box 4. `r4c4`-`r4c6` are ruled out by box 5, `r4c7` and `r4c9` by their columns; `r4c8` was the only one left open, and the 3 is crossed out of it.
3. Box 6: row 5 is ruled out by the 3 in `r5c5`, `r4c7`-`r4c9` by step 2 and the columns, `r6c7` and `r6c9` by columns 7 and 9. Result: `r6c8 = 3`.

## Example: claiming

The sixes are in `r2c2`, `r6c6`, `r9c3`.

```sudoku
. . . | . . . | . . .
. 6 . | . . . | . . .
. . . | . . . | . . .
------+-------+------
. . . | . . . | . . .
8 . . | . . . | . . .
. . . | . . 6 | . . .
------+-------+------
. . . | . . . | . . .
. . . | . . . | . . .
. . 6 | . . . | . . .
unit: r5
pat: r5c7 r5c8 r5c9
x: r5c2 r5c3 r5c4 r5c5 r5c6
cand: r5c7=6 r5c8=6 r5c9=6
elim: r4c7=6 r4c8=6 r4c9=6
ans: r4c1=6
arrow: r5c7>r4c7 r5c8>r4c8 r5c9>r4c9
caption: Row 5: the 6 can only go in box 6, so it is struck from r4c7-r4c9; in row 4 only r4c1 is left
```

In row 5, `r5c1` is filled, `r5c2` and `r5c3` are ruled out by their columns, `r5c4`-`r5c6` by box 5. Left are `r5c7`, `r5c8`, `r5c9` — all in box 6. So the 6 of row 5 is in box 6, and there can be no 6 in `r4c7`, `r4c8`, `r4c9` (`r6c7`-`r6c9` are ruled out by row 6 anyway). Result: the 6 of row 4 can only go in `r4c1` — `r4c2` and `r4c3` are ruled out by their columns, `r4c4`-`r4c6` by box 5.

## Spotting it on the board

- Pick a box where a digit has 2-3 places left. Are they all in one row or one column? If so, extend that line into the neighbouring boxes.
- Pick a row or column where a digit has 2-3 places left. Are they all in one box? If so, look at the other cells of that box.
- Check the result: in the cleared area the digit should be left with one place — that is the move.

```sudoku
. . . | . . . | 7 . .
. . . | 3 . . | . . .
. . . | 1 . . | . . .
------+-------+------
. . . | . . . | . . .
. . . | . 7 . | . . .
. . . | . . . | . . .
------+-------+------
. . . | . . . | . 7 .
. . . | . . . | . . .
. 7 . | . . . | . . .
unit: b2
pat: r2c6 r3c6
x: r1c4 r1c5 r1c6 r2c5 r3c5
cand: r2c6=7 r3c6=7
elim: r8c6=7
ans: r8c4=7
arrow: r2c6>r8c6
caption: Box 2: the 7 can only go in column 6, so r8c6 has no 7; in box 8 only r8c4 is left
```

Pointing along a column: the sevens are in `r1c7`, `r5c5`, `r7c8`, `r9c2`. In box 2, row 1 is ruled out by `r1c7`, column 5 by `r5c5`, and `r2c4` and `r3c4` are filled. Left are `r2c6` and `r3c6` — both in column 6. So the 7 of column 6 is already in box 2, and it is crossed out of `r8c6`. In box 8, rows 7 and 9 are ruled out by the sevens in `r7c8` and `r9c2`, so `r8c4 = 7`.

## How pointing differs from claiming

- Pointing goes from a box to a line: the digit's places in a box lie on one line, and that line is cleared outside the box.
- Claiming goes from a line to a box: the digit's places on a line lie in one box, and that box is cleared outside the line.
- To tell them apart, see where the digit's places are already squeezed into a narrow strip: inside a box on one line — pointing; inside a line in one box — claiming.

## How to find them fast

1. Pointing shows up right while scanning by digit: if a box has 2-3 places left for a digit and all are on one line, extend that line into the neighbouring boxes of the same band or stack.
2. With Snyder notes it jumps out: two marks of one digit in one row or column of a box are a ready pointing pair.
3. Look for claiming when a row or column has few empty cells: check a missing digit — are its places gathered in one box?
4. Use the conclusion at once: look for a hidden single of the same digit in the neighbouring box. The elimination itself gives nothing until it turns into a move.

## Typical mistakes

- Mixing up the direction: pointing clears the line outside the box, claiming clears the box outside the line.
- Applying pointing when the digit's places are only partly on one line — say, two cells in row 1 and one in row 2. There is no conclusion.
- Keeping the elimination in your head and losing it five seconds later. If the conclusion did not give a move at once, mark it with a note or move on.

## Practice

In every medium game, after the first 1-9 scan, make a separate "pointing only" pass: for each digit in each box, ask whether its places lie on one line. Write down how many moves the pass gave and how long it took. Once the pass is fast, build it into the normal scan by digit instead of doing it separately. Reinforce it in the "Pointing" and "Claiming" drills: they show at once which cells to cross out.
