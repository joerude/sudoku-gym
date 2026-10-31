// Tiny markdown renderer: # ## ### headings, paragraphs, - and 1. lists (flat), **bold**, *italic*, `code`,
// ``` fenced blocks. HTML is escaped first, so the output is safe to assign to innerHTML.
import { esc } from "./ui.js";

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, k) => `<code>${codes[+k]}</code>`);
}

export function renderMarkdown(src) {
  const lines = esc(String(src ?? "").replace(/\r\n?/g, "\n")).split("\n");
  const out = [];
  let para = [], list = null, fence = null;
  const flushPara = () => { if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`); para = []; };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  for (const line of lines) {
    if (fence !== null) {
      if (/^```/.test(line.trim())) { out.push(`<pre><code>${fence.join("\n")}</code></pre>`); fence = null; }
      else fence.push(line);
      continue;
    }
    if (/^```/.test(line.trim())) { flushPara(); flushList(); fence = []; continue; }
    const hm = /^(#{1,3})\s+(.*)$/.exec(line);
    if (hm) { flushPara(); flushList(); out.push(`<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`); continue; }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line), ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const tag = ul ? "ul" : "ol";
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((ul || ol)[1]);
      continue;
    }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (list && /^\s+\S/.test(line)) { list.items[list.items.length - 1] += " " + line.trim(); continue; }
    flushList();
    para.push(line.trim());
  }
  if (fence !== null) out.push(`<pre><code>${fence.join("\n")}</code></pre>`);
  flushPara(); flushList();
  return out.join("\n");
}
