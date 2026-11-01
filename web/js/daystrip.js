// Today's plan as one line on #/play: medium hardcore games played today (goal 2), the streak, the daily puzzle, the warm-up, the last game's review.
import { tr } from "./i18n.js";
import { getActivity, getDaily, getStats, listGames } from "./api.js";
import { fmtTime } from "./board.js";
import { h } from "./ui.js";

const GOAL = 2;
// The server groups games by local date (date(started_at, 'localtime')), so "today" is the local date here too.
function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// dimmed until today counts: the streak is still alive, but only until midnight
const streak = s => h("span", { class: `streak${s.today ? "" : " pending"}`, id: "dayStreak",
  title: s.today ? tr("Серия: {n} дн. подряд — сегодня засчитано", { n: s.current })
    : tr("Серия: {n} дн. подряд — сегодня ещё не засчитано, не прерви", { n: s.current }) }, `🔥 ${s.current}`);

// the daily puzzle: solved → time linking to its review; otherwise a link that starts it
const dailyItem = d => d.result
  ? h("a", { href: `#/review/${d.result.game_id}`, id: "dayDaily",
    title: tr("Задача дня решена — разбор") }, `📅 ✓ ${fmtTime(d.result.time_ms)}`)
  : h("a", { href: "#/play?daily=1", id: "dayDaily" }, tr("📅 задача дня →"));

/** load() refetches; on an error the line just stays hidden — it is a reminder, not a page. */
export function dayStrip() {
  const el = h("p", { class: "day-strip zen-hide", id: "dayStrip", hidden: true,
    title: tr("План дня: разминка, 2 партии medium hardcore, разбор последней") });
  return {
    el,
    load() {
      return Promise.all([getStats(), listGames(20), getActivity(), getDaily()]).then(([st, games, act, daily]) => {
        const today = localDay();
        const n = st.daily.filter(d => d.day === today && d.level === "medium" && d.mode === "hardcore").reduce((a, r) => a + r.n, 0);
        const done = Math.min(n, GOAL);
        const last = games.find(g => g.status === "solved" || g.status === "failed") || games.find(g => g.status !== "active");
        el.textContent = "";
        el.classList.toggle("done", n >= GOAL);
        el.append(h("b", {}, tr("Сегодня")), " ",
          h("span", { class: "dots", "aria-hidden": "true" }, "●".repeat(done) + "○".repeat(GOAL - done)),
          ` ${done}/${GOAL} medium · hardcore · `,
          ...(act.streak.current ? [streak(act.streak), " · "] : []), dailyItem(daily), " · ",
          h("a", { href: "#/drills", id: "dayDrills" }, tr("разминка →")),
          ...(last ? [" · ", h("a", { href: `#/review/${last.id}`, id: "dayReview" }, tr("разбор #{id} →", { id: last.id }))] : []));
        el.hidden = false;
      }).catch(() => { el.hidden = true; });
    },
  };
}
