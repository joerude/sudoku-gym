// Today's plan as one line on #/play: medium hardcore games played today (goal 2), the warm-up, the last game's review.
import { tr } from "./i18n.js";
import { getStats, listGames } from "./api.js";
import { h } from "./ui.js";

const GOAL = 2;
// The server groups games by local date (date(started_at, 'localtime')), so "today" is the local date here too.
function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** load() refetches; on an error the line just stays hidden — it is a reminder, not a page. */
export function dayStrip() {
  const el = h("p", { class: "day-strip zen-hide", id: "dayStrip", hidden: true,
    title: tr("План дня: разминка, 2 партии medium hardcore, разбор последней") });
  return {
    el,
    load() {
      return Promise.all([getStats(), listGames(20)]).then(([st, games]) => {
        const today = localDay();
        const n = st.daily.filter(d => d.day === today && d.level === "medium" && d.mode === "hardcore").reduce((a, r) => a + r.n, 0);
        const done = Math.min(n, GOAL);
        const last = games.find(g => g.status === "solved" || g.status === "failed") || games.find(g => g.status !== "active");
        el.textContent = "";
        el.classList.toggle("done", n >= GOAL);
        el.append(h("b", {}, tr("Сегодня")), " ",
          h("span", { class: "dots", "aria-hidden": "true" }, "●".repeat(done) + "○".repeat(GOAL - done)),
          ` ${done}/${GOAL} medium · hardcore · `,
          h("a", { href: "#/drills", id: "dayDrills" }, tr("разминка →")),
          ...(last ? [" · ", h("a", { href: `#/review/${last.id}`, id: "dayReview" }, tr("разбор #{id} →", { id: last.id }))] : []));
        el.hidden = false;
      }).catch(() => { el.hidden = true; });
    },
  };
}
