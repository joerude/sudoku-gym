---
slug: scanning
title: Scanning by digit (Cross-hatching)
level: 1
order: 1
drill: hidden_single_box
summary: Take one digit and cross out, box by box, the lines where it stands: one cell left is a move.
---

# Scanning by digit (Cross-hatching)

Scanning by digit, or cross-hatching, is the main way to find moves on a nearly empty grid. You take one digit and, for each box that does not have it yet, mentally cross out the rows and columns where it already stands. If one free cell is left in the box, that is a move. You don't think about cells, you think about the digit.

## Notation

Rows are numbered 1–9 from top to bottom, columns 1–9 from left to right. Cell `r3c5` is row 3, column 5. The 3×3 boxes are numbered left to right, top to bottom:

```sudoku
. . . | . . . | . . .
. 1 . | . 2 . | . 3 .
. . . | . . . | . . .
------+-------+------
. . . | . . . | . . .
. 4 . | . 5 . | . 6 .
. . . | . . . | . . .
------+-------+------
. . . | . . . | . . .
. 7 . | . 8 . | . 9 .
. . . | . . . | . . .
pat: r3c5
caption: The digits here are box numbers, not cell values. The blue cell r3c5: row 3, column 5, box 2.
```

## Example

Top band (rows 1–3), we look for 5 in box 1. The fives are in `r1c5`, `r2c7` and `r7c3`, and `r3c1` holds a 7.

```sudoku
. . . | . 5 . | . . .
. . . | . . . | 5 . .
7 . . | . . . | . . .
------+-------+------
. . . | . . . | . . .
. . . | . . . | . . .
. . . | . . . | . . .
------+-------+------
. . 5 | . . . | . . .
. . . | . . . | . . .
. . . | . . . | . . .
unit: b1
x: r1c1 r1c2 r1c3 r2c1 r2c2 r2c3 r3c3
ans: r3c2=5
arrow: r1c5>r1c1 r2c7>r2c1 r7c3>r3c3
caption: Three fives and a seven leave one cell for 5 in box 1 — r3c2.
```

- The 5 in `r1c5` rules out row 1 of box 1.
- The 5 in `r2c7` rules out row 2.
- Row 3 leaves `r3c1`, `r3c2`, `r3c3`. `r3c1` holds the 7, `r3c3` is ruled out by the 5 in `r7c3` (column 3).
- Result: `r3c2 = 5`.

## Spotting it on the board

1. Name the digit and find all its copies on the grid. Look at nothing else.
2. Pick a box that does not have this digit. Every copy outside the box closes a line in it: a copy in one of its rows closes that row, a copy in one of its columns closes that column.
3. Cross out the filled cells of the box too: the digit can't go there.
4. One free cell left — that is the move. Two or more — go on to the next box.

Another example: we look for 3 in box 5.

```sudoku
. . . | . . . | . . .
. . . | 3 . . | . . .
. . . | . . . | . . .
------+-------+------
. . . | . 8 . | . . .
. . . | . . . | . . .
3 . . | . . . | . . .
------+-------+------
. . . | . . . | . . .
. . . | . . 3 | . . .
. . . | . . . | . . .
unit: b5
x: r4c4 r4c6 r5c4 r5c6 r6c4 r6c5 r6c6
ans: r5c5=3
arrow: r2c4>r4c4 r8c6>r4c6 r6c1>r6c5
caption: The threes close columns 4 and 6 and row 6, r4c5 holds an 8 — only r5c5 is left for 3 in box 5.
```

- The 3 in `r2c4` closes column 4 (`r4c4`, `r5c4`, `r6c4`), the 3 in `r8c6` closes column 6.
- The 3 in `r6c1` closes row 6: `r6c5` drops out.
- `r4c5` holds an 8, so `r5c5 = 3`.

## How it differs from a hidden single in a row or column

- The logic is the same: the digit has only one place left in a unit. Scanning by digit is a way to look for such places in boxes, going through the boxes with one digit.
- In scanning you stand on a digit and go over the boxes. In a hidden single in a row or column you stand on the line and go over the missing digits.
- A cell of a box is closed by its row and column; a cell of a row is closed by its column and box.
- Scanning works while digits are few and lines are empty. Rows and columns come in when a line has 3–4 empty cells left.

## How to find moves fast

1. Before you start, spend 2–3 seconds judging which digit is most common on the grid. Start with it: the more copies, the more lines are closed and the likelier a single is.
2. For the chosen digit, go through the boxes in order 1→9. In each box without that digit, look first at the band (the two neighbouring rows), then at the stack (the two neighbouring columns).
3. Found a move — place it and immediately scan the same digit again: the new copy closed one more row and column, and the next single often opens in a neighbouring box.
4. Then check the row, column and box of the cell you just filled: they have one empty cell fewer.
5. When the digit gives nothing more, take the next most common one. A full round 1–9 without a single move is the signal to switch to notes.

## Typical mistakes

- Scanning "by cell" instead of "by digit": you look at an empty cell and try nine options. On an empty grid this is many times slower.
- Forgetting the filled cells inside the box and thinking there are two options when one of them already holds another digit.
- No second pass: you placed a digit and jumped to another corner of the grid, and the neighbouring box with a ready single went unnoticed.
- Always starting with 1. The order 1→9 is easy to remember, but a rare digit at the start of the game gives almost nothing.

## Practice

Drill "Hidden Single in a box": the trainer shows a position, you find the single in a box. Rules for speed:

- Name the digit to yourself first, then look for the box. Not the other way round.
- The first week's goal is a steady 5 seconds per position, then cut it to 3.
- After each series of 10 drills, play one game and watch just one thing: after every move, scan the same digit again.
