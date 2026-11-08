// Line icons from lucide (lucide.dev, ISC licence): 16px, stroke 1.5, the colour of the text around them.
const PATHS = {
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  dices: '<rect width="12" height="12" x="2" y="10" rx="2" ry="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/>'
    + '<path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/>',
  lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>'
    + '<path d="M9 18h6"/><path d="M10 22h4"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>'
    + '<path d="m15 5 4 4"/>',
};

/** icon("lock") → an inline <svg class="icon">, hidden from screen readers (the label beside it says it). */
export function icon(name) {
  const t = document.createElement("template");
  t.innerHTML = `<svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
  return t.content.firstChild;
}

/** A button's content as icon + text, for labels that change while the page is open. */
export function setLabel(btn, name, text) {
  btn.replaceChildren(icon(name), text);
}
