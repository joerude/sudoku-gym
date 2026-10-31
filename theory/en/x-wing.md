---
slug: x-wing
title: X-Wing
level: 3
order: 8
drill: x_wing
---

# X-Wing

X-Wing is a technique for one digit over four cells that form a rectangle. If in two rows a digit can only go in the same two columns, in those columns it takes exactly those two rows. So the digit can be crossed out of the other cells of those two columns. It works with the roles swapped too: two columns and two shared rows.

## Example

Digit 4. In row 2 it has exactly two places: `r2c3` and `r2c7`. In row 8 also exactly two: `r8c3` and `r8c7`. The places for 4 (`4` — possible place, `x` — cross out):

```
      c1 c2 c3 c4 c5 c6 c7 c8 c9
r2    .  .  4  .  .  .  4  .  .
r5    .  .  x  .  .  .  x  .  .
r8    .  .  4  .  .  .  4  .  .
```

The logic has two cases:

- if `r2c3 = 4`, then `r2c7` in row 2 is not 4, so the 4 of row 8 is in `r8c7`;
- if `r2c7 = 4`, then the 4 of row 8 is in `r8c3`.

Either way the fours stand on a diagonal of the rectangle and take columns 3 and 7. So in columns 3 and 7 there is no 4 in any other row (row 5 is shown as an example).

## How to find it fast

1. You don't need an X-Wing while singles, pointing and pairs still work. In medium it is rarely needed — if you are stuck, first make one more 1–9 scan: most often a simple single was missed.
2. Pick a digit with 4–6 copies on the grid: it has few places left, but more than two free rows, so there is something to cross out.
3. Go through the rows and write down those where the digit has exactly two places, as column numbers: "row 2 — 3 and 7, row 8 — 3 and 7". Matching numbers — an X-Wing.
4. If the rows give nothing, do the same for columns.
5. After crossing out, check the rectangle's columns for a hidden single of this digit in the affected boxes.

## Typical mistakes

- Taking a row where the digit has three places. The condition is exactly two places in each of the two rows.
- Crossing out in the wrong place: if the base lines are rows, the columns get cleared, and vice versa.
- Confusing it with pointing: an X-Wing is always about two parallel lines and four corners, not about one box.
- Spending a minute hunting for an X-Wing when the grid has a missed single. Timewise it is the most expensive path.

## Practice

When a medium game is stuck, set yourself a limit: one extra 1–9 scan, then no more than 30 seconds looking for an X-Wing in the two most common digits. Separately, outside games, work through X-Wing positions without a timer and say aloud the column numbers for each row with two places. The goal is to recognise the rectangle from the written numbers, not by eye over the whole grid.
