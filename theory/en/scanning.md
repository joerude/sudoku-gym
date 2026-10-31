---
slug: scanning
title: Scanning by digit (Cross-hatching)
level: 1
order: 1
drill: hidden_single_box
---

# Scanning by digit (Cross-hatching)

Scanning by digit, or cross-hatching, is the main way to find moves on a nearly empty grid. You take one digit and, for each box that does not have it yet, mentally cross out the rows and columns where it already stands. If one free cell is left in the box, that is a move. You don't think about cells, you think about the digit.

## Notation

Rows are numbered 1–9 from top to bottom, columns 1–9 from left to right. Cell `r3c5` is row 3, column 5. The 3×3 boxes are numbered left to right, top to bottom:

```
1 2 3
4 5 6
7 8 9
```

## Example

Top band (rows 1–3), we look for 5 in box 1. We also know there is a 5 in `r7c3`.

```
. . . | . 5 . | . . .
. . . | . . . | 5 . .
7 . . | . . . | . . .
```

- The 5 in `r1c5` rules out row 1 of box 1.
- The 5 in `r2c7` rules out row 2.
- Row 3 leaves `r3c1`, `r3c2`, `r3c3`. `r3c1` holds the 7, `r3c3` is ruled out by the 5 in `r7c3`.
- Result: `r3c2 = 5`.

## How to find moves fast

1. Before you start, spend 2–3 seconds judging which digit is most common on the grid. Start with it: the more copies of a digit stand, the more lines they cover and the likelier a single is.
2. For the chosen digit, go through the boxes in order 1→9. In each box without that digit, look first at the band (the two neighbouring rows), then at the stack (the two neighbouring columns).
3. Found a move — place it and immediately scan the same digit again: the new copy covers one more row and column, and the next single often opens in a neighbouring box.
4. Then check the row, column and box of the cell you just filled: they have one empty cell fewer.
5. When the digit gives nothing more, take the next most common one. A full round 1–9 without a single move is the signal to switch to notes.

## Typical mistakes

- Scanning "by cell" instead of "by digit": you look at an empty cell and try nine options. On an empty grid this is many times slower.
- Forgetting the filled cells inside the box and thinking there are two options when one of them already holds another digit.
- No second pass: you placed a digit and jumped to another corner of the grid, and the neighbouring box with a ready single went unnoticed.
- Always starting with 1. The order 1→9 is easy to remember, but a rare digit at the start of the game gives almost nothing.

## Practice

Drill `hidden_single_box`: the trainer shows a position, you find the single in a box. Rules for speed:

- Name the digit to yourself first, then look for the box. Not the other way round.
- The first week's goal is a steady 5 seconds per position, then cut it to 3.
- After each series of 10 drills, play one game and watch just one thing: after every move, scan the same digit again.
