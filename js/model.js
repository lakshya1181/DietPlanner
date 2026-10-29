// Derived client/plan facts used across screens.
import { store, todayIso } from "./store.js";
import { addDaysIso, daysBetween, fmtDate } from "./ui.js";
const fmtShort = (d) => fmtDate(d);

export const planEnd = (p) => addDaysIso(p.startDate, p.days - 1);
export const sortedLog = (c) => [...(c.weightLog || [])].sort((a, b) => a.date.localeCompare(b.date));

export function clientMetrics(c) {
  const log = sortedLog(c), start = log[0], cur = log.at(-1);
  const bmi = cur ? DietRender.computeBmi(cur.kg, c.heightFt, c.heightIn) : null;
  return { log, start, cur, bmi, band: bmi ? DietRender.bmiBand(bmi, store.settingsRO) : null,
    lost: start && cur ? +(start.kg - cur.kg).toFixed(1) : null };
}

export const programOf = (c) => DietRender.programInfo(c, todayIso(), store.plansFor(c.id));

/** status: hold | active | ending | ended | done | none  (+ the relevant plan) */
export function clientStatus(c) {
  const t = todayIso();
  const plans = store.plansFor(c.id);
  const pg = programOf(c);
  if (pg?.onHold) return { key: "hold", label: `On hold till ${fmtShort(pg.onHold.to)}`, cls: "amber", plan: plans[0] };
  if (!plans.length) return { key: "none", label: "No plan yet", cls: "" };
  const current = plans.find((p) => p.startDate <= t && planEnd(p) >= t);
  const future = plans.find((p) => p.startDate > t);
  if (current) {
    const left = daysBetween(t, planEnd(current));
    if (left <= 1 && !future) return { key: "ending", label: left === 0 ? "Plan ends today" : "Plan ends tomorrow", cls: "amber", plan: current };
    return { key: "active", label: `Active · ${left + 1} day${left ? "s" : ""} left`, cls: "green", plan: current };
  }
  if (future) return { key: "upcoming", label: "Plan starts soon", cls: "teal", plan: future };
  const last = plans[0];
  if (pg?.ended) return { key: "done", label: "Program completed", cls: "navy", plan: last };
  return { key: "ended", label: `Plan ended ${daysBetween(planEnd(last), t)}d ago`, cls: "red", plan: last };
}

// Next week number: counts only 7-day plans, so short plans don't make week numbers skip
export function nextWeekNumber(clientId) {
  const nums = store.plansFor(clientId).filter((p) => +p.days === 7).map((p) => p.weekNumber || 0);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

export function newPlanFor(client, pattern) {
  const s = store.settings, d = s.defaults;
  const prev = store.plansFor(client.id)[0];
  // the client's own meal timings (set by their first plan, updated whenever a time is changed in their plan);
  // clients from before this existed take them from their latest plan; a brand-new client gets the type's defaults
  const times = structuredClone(client.slotTimes || prev?.slotTimes || {});
  let start = prev ? addDaysIso(planEnd(prev), 1) : todayIso();
  if (start < todayIso()) start = todayIso();
  for (const h of [...(client.program?.holds || [])].sort((x, y) => x.from.localeCompare(y.from)))
    if (start >= h.from && start <= h.to) start = addDaysIso(h.to, 1);   // never start inside a hold
  return {
    clientId: client.id, pattern, days: 7, startDate: start,
    weekNumber: nextWeekNumber(client.id), slotModes: {}, slotTimes: times, meals: {},
    exercise: structuredClone(d.exercise), servingSizes: structuredClone(d.servingSizes), guidelines: structuredClone(d.guidelines),
    allowedFood: structuredClone(d.allowedFood || []),
    notes: "", reminder: true, pdfSections: { ...s.pdfSections },
  };
}

// Resolve the slots a plan shows: pattern + per-plan overrides of mode/time.
export function planSlots(plan) {
  return DietRender.resolveSlots(plan, store.settingsRO).map((x) => ({ ...x, time: plan.slotTimes?.[x.id] || x.time }));
}
// Copy of the plan type and its sections, saved with the plan, so it still opens and prints if the
// type is later deleted, reset or replaced by a backup/sync.
export function snapshotType(plan) {
  const s = store.settingsRO, pat = DietRender.patternOf(plan, s);
  plan.patternSnapshot = structuredClone(pat);
  plan.slotSnapshot = Object.fromEntries(pat.slots.map((x) => [x.id, structuredClone(DietRender.slotInfo(x.id, plan, s))]));
}
export const typeLabel = (plan) => DietRender.patternOf(plan, store.settingsRO)?.label || "";

// Plan as the render engine expects it (overrides folded into a pattern copy).
// Meal text → {text, link} when the meal list has a link for it (links print only if Settings allow).
export function renderablePlan(plan) {
  const links = new Map(store.data.library.filter((m) => m.link).map((m) => [m.text.toLowerCase().trim(), m.link]));
  const cell = (t) => (t && links.has(String(t).toLowerCase().trim()) ? { text: t, link: links.get(String(t).toLowerCase().trim()) } : t);
  const meals = {};
  for (const [k, m] of Object.entries(plan.meals || {})) meals[k] = { shared: cell(m.shared), days: (m.days || []).map(cell) };
  const _recipes = (plan.recipeIds || []).map((id) => store.recipe(id)).filter((r) => DietRender.recipeHasContent(r));
  return { ...plan, meals, slotModes: plan.slotModes || {}, _recipes };
}
export function renderSettingsFor(plan) {
  const s = store.settings;
  const pat = DietRender.patternOf(plan, s);
  s.mealPatterns[plan.pattern] = { ...pat, slots: pat.slots.map((x) => ({ ...x, time: plan.slotTimes?.[x.id] || x.time })) };
  for (const x of pat.slots) s.slotCatalog[x.id] ||= DietRender.slotInfo(x.id, plan, s);
  return s;
}

// ---------- payments ----------
// client.packages = [{ id, name, fee, start, note, at }], client.payments = [{ id, date, amount, mode, note, packageId, packageName, receiptNo, at }]
// One rule everywhere: money received pays the packages oldest first (by start date, then when added). So the package
// rows, the totals and the Due list always agree, and anything paid beyond all fees shows as "advance".
const pkgOrder = (a, b) => String(a.start || "").localeCompare(String(b.start || "")) || String(a.at || a.id).localeCompare(String(b.at || b.id));
const payOrder = (a, b) => a.date.localeCompare(b.date) || String(a.at || "").localeCompare(String(b.at || ""));
export function paymentSummary(c) {
  const oldest = [...(c.packages || [])].sort(pkgOrder);
  const payments = [...(c.payments || [])].sort((a, b) => -payOrder(a, b));   // newest first for lists
  const fee = oldest.reduce((n, k) => n + (+k.fee || 0), 0), paid = payments.reduce((n, p) => n + (+p.amount || 0), 0);
  let left = paid;
  const alloc = oldest.map((k) => { const f = +k.fee || 0, pd = Math.min(f, left); left -= pd; return { ...k, paid: pd, due: f - pd }; });
  return { packages: alloc.reverse(), oldest, payments, fee, paid, due: Math.max(0, fee - paid), extra: Math.max(0, paid - fee), last: payments[0] || null,
    current: oldest.at(-1) || null };   // newest package: the default for a new payment
}
// What a receipt shows for one payment: totals as they stood right after it (packages added later don't change it).
export function receiptFigures(c, p) {
  const upTo = (x) => payOrder(x, p) <= 0;
  const pkgs = (c.packages || []).filter((k) => !k.at || !p.at || k.at <= p.at || k.id === p.packageId);
  const fee = pkgs.reduce((n, k) => n + (+k.fee || 0), 0);
  const paidTotal = (c.payments || []).filter(upTo).reduce((n, x) => n + (+x.amount || 0), 0);
  const pkg = (c.packages || []).find((k) => k.id === p.packageId);
  const price = pkgs.reduce((n, k) => n + (+(k.price ?? k.fee) || 0), 0), discount = Math.max(0, price - fee);
  const disc = pkgs.filter((k) => k.discount?.amount);
  const main = (pkg?.discount?.amount ? pkg : null) || disc.at(-1) || null;   // the discount shown: this payment's package, else the latest one
  const pct = disc.length === 1 && disc[0].discount.type === "pct" ? disc[0].discount.value : null;
  const savedLine = main?.discount?.showSaved ? String(main.discount.savedLine || "").replace(/\{amount\}/g, "₹" + Math.round(discount).toLocaleString("en-IN")) : "";
  return { packageName: pkg?.name || p.packageName || "", packageStart: pkg?.start || "", packageEnd: pkg?.end || "", fee, paidTotal, due: Math.max(0, fee - paidTotal), extra: Math.max(0, paidTotal - fee),
    price, discount, discountPct: pct, discountReason: disc.map((k) => k.discount.reason).filter(Boolean).join(", "), savedLine };
}
