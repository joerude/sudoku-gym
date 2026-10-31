---
slug: snyder-notation
title: Snyder notation
level: 2
order: 4
drill:
---

# Snyder notation

Snyder notation is a lean system of pencil marks. You mark a digit in a box only when it has exactly two possible places in that box. You don't write full candidate lists in every cell: that takes long and clutters the grid. Pairs of marks give almost every conclusion you need for medium.

## Example

Box 1. The nines on the grid are in `r3c7`, `r5c2`, `r8c3`.

```
.  .  4
.  6  .
2  .  .
```

- Row 3 is ruled out by the 9 in `r3c7`: `r3c2`, `r3c3` drop out.
- Column 2 is ruled out (`r5c2`): `r1c2` drops out.
- Column 3 is ruled out (`r8c3`): `r2c3` drops out.
- `r1c1` and `r2c1` are left — exactly two places. Mark 9 in both cells:

```
{9} .  4
{9} 6  .
 2  .  .
```

Bonus: both marks are in column 1, so the 9 of box 1 is surely in column 1, and column 1 is closed to 9 in boxes 4 and 7 (that is a pointing pair, see the next topic).

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
