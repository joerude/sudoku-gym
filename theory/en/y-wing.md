---
slug: y-wing
title: Y-Wing (XY-Wing)
level: 3
order: 9
drill: y_wing
summary: Pivot {A,B} with wings {A,C}, {B,C}: one wing becomes C, so C goes from cells seeing both wings.
---

# Y-Wing (XY-Wing)

A Y-Wing (XY-Wing) is built from three cells, each with exactly two candidates. The centre, or pivot, is `{A,B}`. Two wings see the pivot (share a unit with it): one is `{A,C}`, the other `{B,C}`. Whatever the pivot turns out to be, one of the wings becomes C. So candidate C is crossed out of any cell that sees both wings.

## Example

Pivot `r5c6` = `{3,7}`. A wing in the same column: `r3c6` = `{1,3}`. A wing in the same row: `r5c8` = `{1,7}`. The wings share the digit 1.

```sudoku
. . . | 2 . 5 | . 6 .
. . . | . . . | . . .
8 9 . | 7 . . | . . .
------+-------+------
. . . | . . . | . 4 .
2 . 9 | . . . | 8 . .
. . . | 1 . . | . 5 .
------+-------+------
. . . | . . 6 | . 3 .
. . . | . . 4 | . . .
. . . | . . . | . . .
pat: r5c6 r3c6 r5c8
cand: r5c6=37 r3c6=13 r5c8=17 r3c8=12
elim: r3c8=1
arrow: r5c6>r3c6 r5c6>r5c8 r3c6>r3c8 r5c8>r3c8
caption: Pivot r5c6 {3,7}, wings r3c6 {1,3} and r5c8 {1,7}: one of the wings is 1, so r3c8 has no 1 and is left with 2
```

- If `r5c6 = 3`, then `r3c6` cannot be 3 and becomes 1.
- If `r5c6 = 7`, then `r5c8` cannot be 7 and becomes 1.
- Either way the 1 is in `r3c6` or in `r5c8`.
- Cell `r3c8` sees `r3c6` through row 3 and `r5c8` through column 8. So `r3c8` has no 1, and from `{1,2}` it is left with `r3c8 = 2`.

## Spotting it on the board

- List the cells with two candidates and try each as the pivot in turn.
- For pivot `{A,B}`, find in its row, column or box a cell `{A,C}` and a cell `{B,C}` with the same C. The wings can lie in the pivot's row, column or box.
- A cell that sees both wings is often the "fourth corner" of a rectangle whose other three corners are the pivot and the wings. If one wing is in the pivot's box, there may be two such cells.

```sudoku
. . . | . . . | 8 1 7
. 3 . | . . . | . . 4
. . 2 | . . 6 | . . 5
------+-------+------
. . . | . . . | . . .
. . . | . . . | . . .
. . . | . . . | . 6 .
------+-------+------
. . . | . . . | 7 . .
. . . | . . . | . 8 .
. 4 . | . 9 . | 5 . .
pat: r2c8 r9c8 r3c7
cand: r2c8=29 r9c8=23 r3c7=39 r3c8=39
elim: r3c8=3 r8c7=3
arrow: r2c8>r9c8 r2c8>r3c7 r3c7>r3c8 r9c8>r3c8 r3c7>r8c7 r9c8>r8c7
caption: Pivot r2c8 {2,9}, wings r9c8 {2,3} (by column) and r3c7 {3,9} (by box): no 3 in r3c8 or r8c7
```

Here one wing is in the pivot's box (`r3c7`, box 3), the other in its column (`r9c8`). Pivot `r2c8` = `{2,9}`, wings `{2,3}` and `{3,9}`, the shared digit is 3. If `r2c8 = 2`, then `r9c8 = 3`; if `r2c8 = 9`, then `r3c7 = 3`. Cross the 3 out of the cells that see both wings: `r3c8` (row 3 and column 8) and `r8c7` (column 7 and box 9).

## How it differs from a naked pair and an X-Wing

- A naked pair is two cells of one unit with the same candidates. In a Y-Wing the cells differ (`{A,B}`, `{A,C}`, `{B,C}`) and are linked through the pivot; the wings need not see each other.
- An X-Wing works with one digit over four cells. A Y-Wing works with three digits over three cells and crosses out one of them (C).
- Common ground: the conclusion rests on "either one or the other" — both branches lead to the same digit in different cells.

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

In medium a Y-Wing is almost never needed to solve, so practise it separately from timed games. Take positions with written candidates and, for every cell with two candidates, say: "pivot 3-7, looking for 3-x and 7-x". In one session work through 5 positions without a timer, then the same 5 positions with a timer. The "Y-Wing" drill is made for this. In timed games, check for a Y-Wing only if the 1-9 scan, notes and pairs gave nothing.
