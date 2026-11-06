---
slug: snyder-notation
title: Snyder notation
level: 2
order: 4
drill:
summary: Mark a digit only when it has exactly two places in a box: pairs of marks give moves.
---

# Snyder notation

Snyder notation is a lean system of pencil marks. You mark a digit in a box only when it has exactly two possible places in that box. You don't write full candidate lists in every cell: that takes long and clutters the grid. Pairs of marks give almost every conclusion you need for medium.

## Example

Box 1. The nines on the grid are in `r3c7`, `r5c2`, `r8c3`; the box already holds 4, 6 and 2.

```sudoku
. . 4 | . . . | . . .
. 6 . | . . . | . . .
2 . . | . . . | 9 . .
------+-------+------
. . . | . . . | . . .
. 9 . | . . . | . . .
. . . | . . . | . . .
------+-------+------
. . . | . . . | . . .
. . 9 | . . . | . . .
. . . | . . . | . . .
unit: b1
x: r1c2 r2c3 r3c2 r3c3
cand: r1c1=9 r2c1=9
arrow: r3c7>r3c2 r5c2>r1c2 r8c3>r2c3
caption: The nines close r3c2, r3c3, r1c2, r2c3; 9 has two places in box 1 — mark 9 in both cells.
```

- Row 3 is ruled out by the 9 in `r3c7`: `r3c2`, `r3c3` drop out.
- Column 2 is ruled out (`r5c2`): `r1c2` drops out.
- Column 3 is ruled out (`r8c3`): `r2c3` drops out.
- `r1c1` and `r2c1` are left — exactly two places. Mark 9 in both cells.

Bonus: both marks are in column 1, so the 9 of box 1 is surely in column 1, and column 1 is closed to 9 in boxes 4 and 7 (that is a pointing pair, see the next topic).

## Spotting it on the board

1. Pick a box and a digit it lacks. Cross out the filled cells of the box.
2. Run your eye along the lines from the copies of the digit: each copy in a row or column of the box closes its line.
3. Count the open cells. One is a hidden single, place the digit. Two — put marks. Three or more — skip.
4. If both marks lie on one line of the box, the box's digit is surely on it.

Example: we look for 6 in box 5.

```sudoku
. . . | . . . | . . .
. . . | . . . | . . .
. . . | . . . | . . .
------+-------+------
. . . | . 2 . | . . .
6 . . | . . . | . . .
. . . | . . . | . . 6
------+-------+------
. . . | . . . | . . .
. . . | . . . | . . .
. . . | . . . | . . .
unit: b5
x: r5c4 r5c5 r5c6 r6c4 r6c5 r6c6
cand: r4c4=6 r4c6=6
arrow: r5c1>r5c4 r6c9>r6c6
caption: 6 has two places in box 5, both in row 4: mark 6 in r4c4 and r4c6.
```

- The 6 in `r5c1` closes row 5 (`r5c4`, `r5c5`, `r5c6`), the 6 in `r6c9` closes row 6.
- `r4c5` holds a 2.
- `r4c4` and `r4c6` are left — two marks, both in row 4. So the 6 of box 5 is in row 4, and it cannot be in the cells of row 4 outside box 5.

## How it differs from full candidates

- Full candidates are everything that fits a cell; Snyder marks are only digits with exactly two places in the box.
- Full candidates are many: on a sparse board a cell has six or more. Marks are few, and pairs show at once.
- Marks say nothing about which other digits fit a cell. Full candidates do, so naked pairs and harder patterns can be searched on them.

```sudoku
. . 4 | . . . | . . .
. 6 . | . . . | . . .
2 . . | . . . | 9 . .
------+-------+------
. . . | . . . | . . .
. 9 . | . . . | . . .
. . . | . . . | . . .
------+-------+------
. . . | . . . | . . .
. . 9 | . . . | . . .
. . . | . . . | . . .
unit: b1
cand: r1c1=135789 r2c1=135789
caption: The same cells with full candidates: six digits in each. The Snyder mark is just «9».
```

- Full candidates are for when a unit has 3–5 empty cells left: the lists are short, and you can look for a pair.

## How to use it fast

1. Notes start when a full 1–9 scan has given no move at all. Earlier is a waste of time.
2. Make one pass over digits 1–9: for each digit in each box, if there are exactly two places, put two marks. Three or more — write nothing.
3. Every digit you place removes its marks in its box, row and column. If only one mark of a digit is left in a box, that is a hidden single — place the digit.
4. Two cells of a box with the same two marks (say, both `{3,8}`) are a hidden pair: nothing else goes into those cells. That narrows the other cells of the box.
5. If both marks of a digit lie on one line of the box, close that line to the digit in the neighbouring boxes at once and scan them.
6. When a box has 3–4 empty cells left, you can write full candidates — they are short by then.

## Typical mistakes

- Marking three places "just in case". The grid gets overgrown and pairs stop jumping out.
- Not removing marks after a move. If auto-clear is on in the trainer, it removes only marks of the same digit in the row, column and box. The conclusion "one mark is left" is yours to draw.
- Treating Snyder marks as a full candidate list. Marks `{1,7}` in a cell don't mean only 1 and 7 fit there — other digits may simply have had three places. You cannot look for a naked pair with such marks.
- In hardcore: a mark placed by mistake makes every conclusion from it wrong. Check a mark the way you check a digit.

## Practice

Take a medium game and stop at the moment the 1–9 scan gives nothing. Time a full pass of Snyder notes over all nine digits. Then find every move the marks gave. Repeat on three games and compare the pass times: the goal is one even round, without going back to digits already checked.
