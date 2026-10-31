---
slug: y-wing
title: Y-Wing (XY-Wing)
level: 3
order: 9
drill: y_wing
---

# Y-Wing (XY-Wing)

A Y-Wing (XY-Wing) is built from three cells, each with exactly two candidates. The centre, or pivot, is `{A,B}`. Two wings see the pivot (share a unit with it): one is `{A,C}`, the other `{B,C}`. Whatever the pivot turns out to be, one of the wings becomes C. So candidate C is crossed out of any cell that sees both wings.

## Example

Pivot `r2c2` = `{1,2}`. A wing in the same row: `r2c7` = `{1,9}`. A wing in the same column: `r5c2` = `{2,9}`. The wings share the digit 9.

```
        c2         c7
r2    {1,2} ---- {1,9}
        |
        |
r5    {2,9}        x
```

- If `r2c2 = 1`, then `r2c7` cannot be 1 and becomes 9.
- If `r2c2 = 2`, then `r5c2` cannot be 2 and becomes 9.
- Either way the 9 is in `r2c7` or in `r5c2`.
- Cell `r5c7` sees `r2c7` through column 7 and `r5c2` through row 5. So `r5c7` has no 9.

If one wing is in the pivot's box and the other on its line, the wings share more "viewers" — you can cross out in several cells at once (up to five), not just one.

## How to find it fast

1. A Y-Wing needs full candidates in the two-digit cells. Snyder marks won't do: two marks in a cell don't guarantee there are no other candidates.
2. Start with the cells that have exactly two candidates. Try each one as the pivot.
3. For pivot `{A,B}`, look at its row, column and box: find a cell `{A,C}` and a cell `{B,C}` with the same C.
4. Found it — find the cells that see both wings and cross C out of them. Then check whether any of them has become a naked single.
5. The order matters for time: Y-Wing comes after singles, pointing and pairs, together with X-Wing.

## Typical mistakes

- Wings that see each other but not the pivot. The pivot must see both wings; the wings need not see each other.
- A pivot with three candidates. All three cells have strictly two candidates.
- Crossing C out of a cell that sees only one wing.
- Crossing out A or B instead of C. Only the wings' shared digit is crossed out.

## Practice

In medium a Y-Wing is almost never needed to solve, so practise it separately from timed games. Take positions with written candidates and, for every cell with two candidates, say: "pivot 1-2, looking for 1-x and 2-x". In one session work through 5 positions without a timer, then the same 5 positions with a timer. In timed games, check for a Y-Wing only if the 1–9 scan, notes and pairs gave nothing.
