// Small UI toolkit: safe HTML templating, icons, toast, modals, autocomplete, chart.
import { store, normText } from "./store.js";

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
// html`...${value}...` escapes values unless wrapped in raw(); arrays are joined.
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    const one = (x) => (x instanceof Raw ? x.s : x === false || x == null ? "" : esc(x));
    out += (Array.isArray(v) ? v.map(one).join("") : one(v)) + strings[i + 1];
  });
  return new Raw(out);
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const P = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  users: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM22 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  plus: "M12 5v14M5 12h14", edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4", trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  file: "M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6", image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-.01",
  share: "M4 12v7h16v-7M12 3v12M7 8l5-5 5 5", download: "M12 3v12M7 10l5 5 5-5M4 19h16", copy: "M8 8h12v12H8zM4 16V4h12",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  whatsapp: "M20 11.6a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.5-4.4A8.4 8.4 0 1 1 20 11.6zM8.6 8.4c.3 2.8 3.2 5.6 6 6l1.2-1.4-2-.9-.8.8a5 5 0 0 1-2.2-2.2l.8-.8-.9-2z",
  cloud: "M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z", check: "M5 12.5l4.5 4.5L19 7.5",
  bell: "M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2 2 0 0 0 4 0", install: "M12 3v12M7 10l5 5 5-5M5 21h14",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4", x: "M6 6l12 12M18 6L6 18", scale: "M4 6h16v14H4zM8 10a4 4 0 0 1 8 0M12 10l1.5-2",
  ruler: "M3 16L16 3l5 5L8 21zM7.5 11.5l2 2M10.5 8.5l2 2M13.5 5.5l2 2", link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  sunrise: "M3 18h18M7 18a5 5 0 0 1 10 0M12 6v4M5.2 11.2l2 1.4M18.8 11.2l-2 1.4M6 21h12",
  cup: "M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3",
  apple: "M12 7.5c-2-1.6-7-1.2-7 4.2 0 4.3 3.3 8.3 7 7.3 3.7 1 7-3 7-7.3 0-5.4-5-5.8-7-4.2zM12 7.5c0-2.2 1.2-3.8 3.4-4.5",
  bowl: "M3 11h18a9 7.5 0 0 1-18 0zM7 21h10M9 3.5c-.8 1.5.8 2.5 0 4M13 3.5c-.8 1.5.8 2.5 0 4",
  tea: "M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1a2 2 0 0 1 0 4h-1M3 21h16M10.5 3c-1 1 1 2 0 3",
  moon: "M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z", leaf: "M5 19C5 10 10 5 20 4c-1 10-6 15-15 15zM5 19l8-8",
  glass: "M7 3h10l-1.5 17h-7zM7.6 8h8.8",
  dumbbell: "M3 9v6M6.5 6.5v11M17.5 6.5v11M21 9v6M6.5 12h11",
  bed: "M3 18v-9M3 14h18v4M21 18v-4a3 3 0 0 0-3-3h-7v3M6.5 11.5a1.5 1.5 0 1 0 0-.01",
  pill: "M8.5 15.5l7-7a3.5 3.5 0 0 0-5-5l-7 7a3.5 3.5 0 0 0 5 5zM7 8.5l5 5",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z", menu: "M4 6h16M4 12h16M4 18h16", more: "M12 6h.01M12 12h.01M12 18h.01",
};
export const SLOT_ICONS = ["sunrise", "cup", "glass", "apple", "bowl", "tea", "moon", "leaf", "dumbbell", "bed", "pill", "star"];
export const SLOT_COLORS = [
  { accent: "#E8782A", fill: "#FFF1E5" }, { accent: "#5E9F25", fill: "#EEF7E3" }, { accent: "#23948B", fill: "#E3F4F2" },
  { accent: "#D9412F", fill: "#FDECE9" }, { accent: "#C28E0E", fill: "#FFF6DA" }, { accent: "#1E3A6B", fill: "#E9EEF8" },
  { accent: "#7A4FD6", fill: "#F1ECFC" }, { accent: "#C2427E", fill: "#FCEAF2" }, { accent: "#2C7DB8", fill: "#E6F1FA" },
];
export const icon = (n) => raw(`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n] || ""}"/></svg>`);

// ---------- formatting ----------
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const parseIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDaysIso = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return toIso(d); };
export const fmtDate = (s, opts = {}) => { if (!s) return ""; const d = parseIso(s); return `${opts.weekday ? WD[d.getDay()] + ", " : ""}${d.getDate()} ${MONTHS[d.getMonth()]}${opts.year ? " " + d.getFullYear() : ""}`; };
export const wd = (s) => WD[parseIso(s).getDay()];
export const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);
// "9:30 am" <-> "09:30"
export function to24(t) { const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(String(t || "").trim()); if (!m) return ""; let h = +m[1]; const ap = (m[3] || "").toLowerCase(); if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0; return `${String(h).padStart(2, "0")}:${m[2]}`; }
export function to12(t) { if (!t) return ""; let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return `${h}:${String(m).padStart(2, "0")} ${ap}`; }
export const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const AV = ["#2BA39A", "#1E3A6B", "#E8782A", "#5E9F25", "#D9412F", "#7A5AF8", "#C28E0E"];
export const avatarColor = (s) => AV[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];

// ---------- toast / modal ----------
let toastT;
export function toast(msg, ms = 2600) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), ms); }

const openModals = new Set();
export function modal(content, { onMount, closeButton = true, keepOnNavigate = false, discardCheck = true } = {}) {
  // Closes only through its own buttons (✕, Cancel, Save…): tapping outside or pressing Esc does nothing,
  // so a half-filled form is never lost by accident.
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const back = document.createElement("div"); back.className = "modal-back";
    const id = "m" + Math.random().toString(36).slice(2, 8);
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="${id}" tabindex="-1">${closeButton ? `<button type="button" class="icon-btn modal-x" data-close="" aria-label="Close">${String(icon("x"))}</button>` : ""}${content}</div>`;
    const box = back.firstElementChild;
    box.querySelector("h2")?.setAttribute("id", id);
    // Anything typed/changed in the window makes it "dirty": ✕ / Cancel (or phone Back) then asks before discarding.
    let dirty = false;
    const markDirty = (e) => { const t = e.target; if (t.matches?.('input[type="search"], [data-nodirty]')) return; if (t.matches?.("input, textarea, select")) dirty = true; };
    box.addEventListener("input", markDirty); box.addEventListener("change", markDirty);
    // tapping a choice (chip, quick button, colour, icon…) is a change too
    box.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && !("close" in b.dataset) && !b.closest("[data-nodirty]")) dirty = true; });
    const entry = { close: (v) => close(v), keepOnNavigate, isDirty: () => discardCheck && dirty && back.isConnected };
    const close = (v) => { back.remove(); openModals.delete(entry); document.removeEventListener("keydown", trap, true); try { prevFocus?.focus?.(); } catch {} resolve(v); };
    // keep keyboard focus inside the dialog
    const trap = (e) => {
      if (e.key !== "Tab" || !back.isConnected) return;
      const f = [...box.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { f.at(-1).focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { f[0].focus(); e.preventDefault(); }
    };
    document.addEventListener("keydown", trap, true);
    back.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-close]"); if (!b || b.closest(".modal") !== box) return;
      if (b.dataset.close === "" && discardCheck && dirty && !(await confirmBox("Discard changes?", "What you typed in this window will be lost.", "Discard"))) return;
      close(b.dataset.close);
    });
    $("#modalRoot").appendChild(back);
    openModals.add(entry);
    onMount && onMount(box, close);
    if (!box.contains(document.activeElement)) (box.querySelector("input, textarea, select") || box).focus();
  });
}
// Called when the page changes (e.g. phone Back button) so a dialog never stays over the wrong page.
export function closeAllModals() { [...openModals].filter((m) => !m.keepOnNavigate).forEach((m) => m.close(null)); }
// True if a pop-up with unsaved typing is open (the router asks before leaving the page).
export const modalsDirty = () => [...openModals].some((m) => !m.keepOnNavigate && m.isDirty?.());
export const confirmBox = (title, text, okLabel = "Delete", danger = true) => modal(String(html`
  <h2>${title}</h2><p class="muted">${text}</p>
  <div class="actions"><button class="btn ghost" data-close="">Cancel</button><button class="btn ${danger ? "coral" : ""}" data-close="ok">${okLabel}</button></div>`)).then((v) => v === "ok");

// ---------- autocomplete (one shared meal list for every slot) ----------
export function attachAutocomplete(input) {
  if (input._ac) return;
  input._ac = true;
  const wrap = document.createElement("div"); wrap.className = "ac-wrap";
  input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
  let list = null, items = [], active = -1;
  const close = () => { list?.remove(); list = null; active = -1; };
  const choose = (i) => { if (!items[i]) return; input.value = items[i].text; input.dispatchEvent(new Event("input", { bubbles: true })); close(); input.focus(); };
  const render = () => {
    const qv = normText(input.value);
    if (qv.length < 2) return close();
    const words = qv.split(" "), used = store.mealUsage();
    items = store.data.library.filter((m) => { const t = normText(m.text); return t !== qv && words.every((w) => t.includes(w)); })
      .sort((a, b) => (used.get(normText(b.text)) || 0) - (used.get(normText(a.text)) || 0)).slice(0, 8);
    if (!items.length) return close();
    if (!list) { list = document.createElement("div"); list.className = "ac-list"; wrap.appendChild(list); }
    const re = new RegExp("(" + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "ig");
    const hl = (t) => String(t).split(re).map((part, k) => (k % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join("");   // highlight, then escape each piece
    list.innerHTML = items.map((m, i) => `<div class="ac-item${i === active ? " active" : ""}" data-i="${i}">${hl(m.text)}</div>`).join("");
  };
  input.addEventListener("input", (e) => { if (e.isTrusted !== false) { active = -1; render(); } });
  input.addEventListener("focus", render);
  input.addEventListener("blur", () => setTimeout(close, 150));
  input.addEventListener("keydown", (e) => {
    if (!list) return;
    if (e.key === "ArrowDown") { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); render(); e.preventDefault(); }
    else if (e.key === "Enter" && active >= 0) { choose(active); e.preventDefault(); }
    else if (e.key === "Escape") close();
  });
  wrap.addEventListener("mousedown", (e) => { const it = e.target.closest(".ac-item"); if (it) { e.preventDefault(); choose(+it.dataset.i); } });
}
export function autoGrow(ta) { const f = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + 2 + "px"; }; ta.addEventListener("input", f); requestAnimationFrame(f); }

// ---------- weight chart for the screen ----------
export function weightChartSvg(log, color = "#2BA39A") {
  const pts = [...log].filter((p) => p && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && isFinite(+p.kg)).map((p) => ({ date: p.date, kg: +p.kg }))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(-Math.max(2, +store.settingsRO.output.chartMaxPoints || 12));
  if (pts.length < 2) return `<div class="empty small">The chart appears after 2 weigh-ins.</div>`;
  const W = 600, H = 190, L = 38, R = 12, T = 12, B = 26;
  const v = pts.map((p) => p.kg), lo = Math.floor(Math.min(...v) - 0.5), hi = Math.ceil(Math.max(...v) + 0.5);
  const X = (i) => L + ((W - L - R) * i) / (pts.length - 1), Y = (k) => T + (H - T - B) * (1 - (k - lo) / (hi - lo));
  const line = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(" ");
  const ticks = [hi, (lo + hi) / 2, lo].map((k) => `<line x1="${L}" x2="${W - R}" y1="${Y(k)}" y2="${Y(k)}" stroke="#E3E8EE"/><text x="${L - 6}" y="${Y(k) + 4}" text-anchor="end" font-size="11" fill="#7A8594">${k}</text>`).join("");
  const labels = [0, pts.length - 1].map((i) => `<text x="${X(i)}" y="${H - 6}" text-anchor="${i ? "end" : "start"}" font-size="11" fill="#7A8594">${fmtDate(pts[i].date)}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight chart">${ticks}
    <polygon points="${L},${Y(lo)} ${line} ${X(pts.length - 1)},${Y(lo)}" fill="${color}" fill-opacity=".12"/>
    <line x1="${L}" x2="${W - R}" y1="${Y(v[0])}" y2="${Y(v[0])}" stroke="#7A8594" stroke-dasharray="4 4"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.kg)}" r="${i === pts.length - 1 ? 5 : 3.5}" fill="${i === pts.length - 1 ? "#E5493A" : color}" stroke="#fff" stroke-width="1.5"><title>${fmtDate(p.date)}: ${p.kg} kg</title></circle>`).join("")}
    ${labels}</svg>`;
}
