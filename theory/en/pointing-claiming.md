---
slug: pointing-claiming
title: Pointing and Claiming
level: 2
order: 5
drill: pointing
---

# Pointing and Claiming

Both techniques work where a box crosses a line (a row or a column). Pointing pair/triple: if inside a box a digit can only go in one row (or column), it cannot be in that row outside the box. Claiming (Box-Line Reduction) is the reverse: if in a row (or column) a digit can only go inside one box, it cannot be in the other cells of that box.

## Example: a pointing triple

Top band. The sevens on the grid are in `r6c2` and `r5c8`.

```
. . . | . . . | . . .
4 8 2 | . . . | 5 . 1
6 . 3 | . . . | 9 . .
```

1. Box 1: `r1c1`, `r1c2`, `r1c3`, `r3c2` are free. `r3c2` is ruled out by the 7 in `r6c2`. So the 7 of box 1 is in row 1.
2. Pointing: there is no 7 in row 1 outside box 1. `r1c7`, `r1c8`, `r1c9` are ruled out.
3. Box 3: `r1c7`, `r1c8`, `r1c9`, `r2c8`, `r3c8`, `r3c9` are free. Row 1 is ruled out by step 2, `r2c8` and `r3c8` by the 7 in `r5c8`.
4. Result: `r3c9 = 7`. Without pointing, box 3 would have four places.

## Example: claiming

```
r5:  . . . | 1 . 7 | 2 . 9
```

The sixes are in `r2c5` and `r8c8`. In row 5 outside box 4 only `r5c5` and `r5c8` are free, and both are ruled out by their columns. So the 6 of row 5 is in `r5c1`, `r5c2` or `r5c3` — inside box 4. Claiming: there can be no 6 in rows 4 and 6 of box 4.

## How to find them fast

1. Pointing shows up right while scanning by digit: if a box has 2–3 places left for a digit and all are on one line, extend that line into the neighbouring boxes of the same band or stack.
2. With Snyder notes it jumps out: two marks of one digit in one row or column of a box are a ready pointing pair.
3. Look for claiming when a row or column has few empty cells: check a missing digit — are its places gathered in one box?
4. Use the conclusion at once: look for a hidden single of the same digit in the neighbouring box. The elimination itself gives nothing until it turns into a move.

## Typical mistakes

- Mixing up the direction: pointing clears the line outside the box, claiming clears the box outside the line.
- Applying pointing when the digit's places are only partly on one line — say, two cells in row 1 and one in row 2. There is no conclusion.
- Keeping the elimination in your head and losing it five seconds later. If the conclusion did not give a move at once, mark it with a note or move on.

## Practice

In every medium game, after the first 1–9 scan, make a separate "pointing only" pass: for each digit in each box, ask whether its places lie on one line. Write down how many moves the pass gave and how long it took. Once the pass is fast, build it into the normal scan by digit instead of doing it separately.
