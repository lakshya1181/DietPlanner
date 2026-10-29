// Plan editor: 2/3-meal pattern (asked once per client), 1–7 days, daily / same-every-day slots,
// shared meal list with autocomplete, exercise, serving sizes, guidelines. (Weights are entered on the client page.)
import { store, local, todayIso, normText } from "../store.js";
import { html, icon, toast, modal, confirmBox, attachAutocomplete, autoGrow, fmtDate, wd, addDaysIso, to12, to24, toIso } from "../ui.js";
import { newPlanFor, planSlots, planEnd, renderablePlan, snapshotType, typeLabel } from "../model.js";
import { openExport } from "./exportDialog.js";
import { calendarReady, pushReminder, removeReminder, planEndReminder } from "../reminders.js";

export async function askPattern(client, forTemplate) {
  const s = store.settings;
  return modal(String(html`
    <h2>Meal plan type for ${client.name}</h2>
    <p class="muted small">${forTemplate ? "You can change it later on the template screen." : "Asked once. All future plans for this client use the same type until you change it."}</p>
    ${Object.entries(s.mealPatterns).map(([k, p]) => html`
      <button class="choice" data-close="${k}"><span class="big">${p.label[0]}</span>
        <span><b>${p.label}</b><span class="small muted">Main meals: ${p.slots.filter((x) => x.mode === "daily").map((x) => DietRender.slotInfo(x.id, {}, s).name).join(", ")}</span></span></button>`)}
    <div class="actions"><button class="btn ghost" data-close="">Cancel</button></div>`));
}

// Same person = same client record (Client ID). Two people with the same name never block each other.
const isSameClient = (a, b) => !!a && !!b && a.id === b.id;
function duplicateOf(plan, client) {
  return store.data.plans.find((p) => p.id !== plan.id && p.startDate === plan.startDate && isSameClient(store.client(p.clientId), client));
}
function alreadyCreated(p, text, allowNew) {
  const title = p.days === 7 && p.weekNumber ? `Week ${p.weekNumber}` : `${p.days}-Day Plan`;
  return modal(String(html`<h2>Plan already created</h2>
    <p class="muted">${text}</p>
    <div class="card" style="box-shadow:none;background:var(--soft)"><b>${title}</b>
      <div class="small muted">${fmtDate(p.startDate, { weekday: true })} – ${fmtDate(planEnd(p), { weekday: true, year: true })}</div></div>
    <div class="actions"><button class="btn ghost" data-close="">Cancel</button><button class="btn teal" data-close="open">Open that plan</button></div>
    ${allowNew ? html`<p style="text-align:center;margin:12px 0 0"><button class="btn small ghost" data-close="new">Create another plan anyway</button></p>` : ""}`));
}

// Pick recipes for a plan; recipes whose name appears in the plan's meals are listed first as suggestions.
async function pickRecipes(plan) {
  const text = normText(Object.values(plan.meals || {}).flatMap((m) => [m.shared, ...(m.days || [])]).join(" | "));
  const all = [...store.data.recipes].map((r) => ({ r, hit: !!r.name && text.includes(normText(r.name)) }))
    .sort((a, b) => (b.hit - a.hit) || a.r.name.localeCompare(b.r.name));
  if (!all.length) { toast("No recipes yet. Add them under Meals → Recipes."); return null; }
  const chosen = new Set(plan.recipeIds || []);
  return modal(String(html`<h2>Recipes for this plan</h2>
    <input type="search" id="rq" placeholder="Search recipes" style="margin:10px 0">
    <div class="list" id="rl" style="max-height:50vh;overflow:auto">${all.map(({ r, hit }) => html`
      <label class="list-item" data-name="${normText(r.name + " " + (r.category || ""))}" style="cursor:pointer">
        <input type="checkbox" value="${r.id}" ${chosen.has(r.id) ? "checked" : ""} style="width:20px;height:20px;accent-color:var(--teal)">
        <span class="grow"><b>${r.name}</b> ${hit ? html`<span class="badge teal">in this plan</span>` : ""}<div class="tiny muted">${r.category || ""}</div></span></label>`)}</div>
    <div class="actions"><button class="btn ghost" data-close="">Cancel</button><button class="btn teal" id="ok">Done</button></div>`), {
    onMount(el, close) {
      el.querySelector("#rq").addEventListener("input", (e) => { const q = normText(e.target.value); el.querySelectorAll("#rl [data-name]").forEach((x) => (x.hidden = q && !x.dataset.name.includes(q))); });
      el.querySelector("#ok").onclick = () => close([...el.querySelectorAll("#rl input:checked")].map((x) => x.value));
    },
  });
}

// ---------- plan templates ----------
// A template is only the meal plan: type, days, meals with Daily/Same choices and timings.
const TEMPLATE_KEYS = ["pattern", "patternSnapshot", "slotSnapshot", "days", "meals", "slotModes"];   // no timings: each client keeps their own
export function templateFromPlan(plan, name) {
  snapshotType(plan);
  const t = { name };
  for (const k of TEMPLATE_KEYS) if (plan[k] !== undefined) t[k] = structuredClone(plan[k]);
  return t;
}
// Put a template's or another plan's content into this plan (dates, client, notes and call summary stay).
// mealsOnly (templates): only the meal plan is taken; exercise, serving guide, guidelines, recipes and PDF ticks stay as they are.
function applySource(plan, src, mealsOnly = false) {
  plan.pattern = src.pattern; plan.days = Math.min(7, Math.max(1, +src.days || 7));
  if (src.patternSnapshot) plan.patternSnapshot = structuredClone(src.patternSnapshot);
  if (src.slotSnapshot) plan.slotSnapshot = structuredClone(src.slotSnapshot);
  // meals only – timings never come from another plan or a template (this client's own timings stay)
  plan.meals = structuredClone(src.meals || {}); plan.slotModes = structuredClone(src.slotModes || {});
  if (mealsOnly) return;
  plan.allowedFood = structuredClone(src.allowedFood || []);
  plan.exercise = structuredClone(src.exercise || []); plan.servingSizes = structuredClone(src.servingSizes || []);
  plan.guidelines = structuredClone(src.guidelines || []).map((g) => ({ type: "prefer", title: "", ...g, items: g.items || [] }));
  plan.recipeIds = [...(src.recipeIds || [])].filter((x) => store.recipe(x));
  if (src.pdfSections) plan.pdfSections = { ...plan.pdfSections, ...structuredClone(src.pdfSections), callSummary: plan.pdfSections.callSummary };
}
// Anything on the screen that a template/copy would replace? (meals, recipes, or exercise/serving/guidelines changed from the defaults)
function hasContent(plan) {
  const d = store.settingsRO.defaults, same = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);
  return Object.values(plan.meals || {}).some((m) => m && (m.shared || (m.days || []).some(Boolean))) || (plan.recipeIds || []).length > 0
    || !same(plan.exercise, d.exercise) || !same(plan.servingSizes, d.servingSizes) || !same(plan.guidelines?.map((g) => ({ ...g })), d.guidelines);
}
const typeNote = (plan, src, client) => (client && client.mealPattern && src.pattern !== client.mealPattern
  ? ` It uses “${DietRender.patternOf(src, store.settingsRO)?.label || "another type"}” for this plan; ${client.name}'s usual type stays “${store.settingsRO.mealPatterns[client.mealPattern]?.label || client.mealPattern}”.` : "");
const mealCount = (t) => Object.values(t.meals || {}).reduce((n, m) => n + (m?.shared ? 1 : 0) + (m?.days || []).filter(Boolean).length, 0);
export async function pickTemplate(exceptId) {
  const list = [...(store.data.templates || [])].filter((t) => t.id !== exceptId).sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) { toast("No templates yet. Make one under Meals → Templates."); return null; }
  const id = await modal(String(html`<h2>Start from a template</h2>
    <input type="search" id="tq" placeholder="Search templates" style="margin:10px 0">
    <div class="list" id="tl" style="max-height:55vh;overflow:auto">${list.map((t) => html`
      <button class="list-item" style="width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);cursor:pointer" data-close="${t.id}" data-name="${t.name.toLowerCase()}">
        <div class="grow"><b>${t.name}</b><div class="small muted">${DietRender.patternOf(t, store.settingsRO)?.label || ""} · ${t.days} day${t.days > 1 ? "s" : ""} · ${mealCount(t)} meals filled</div></div></button>`)}</div>
    <div class="actions"><button class="btn ghost" data-close="">Cancel</button></div>`), {
    onMount(el) { el.querySelector("#tq").addEventListener("input", (e) => { const q = e.target.value.toLowerCase().trim(); el.querySelectorAll("#tl [data-name]").forEach((r) => (r.hidden = q && !r.dataset.name.includes(q))); }); },
  });
  return id ? store.template(id) : null;
}

// Choose any saved plan (this client's first, then others) to copy from.
async function pickPlan(plans, clientId) {
  const s = store.settings;
  const rows = plans.map((p) => ({ p, c: store.client(p.clientId) })).filter((x) => x.c)
    .sort((a, b) => (a.p.clientId === clientId ? 0 : 1) - (b.p.clientId === clientId ? 0 : 1) || b.p.startDate.localeCompare(a.p.startDate));
  const label = (p) => (p.days === 7 && p.weekNumber ? `Week ${p.weekNumber}` : `${p.days}-Day Plan`);
  const id = await modal(String(html`<h2>Copy from another plan</h2>
    <p class="small muted">Copies meals, plan type, number of days, times, exercise, serving guide and guidelines. Replaces what's here.</p>
    <input type="search" id="pq" placeholder="Search client name or ID" style="margin:10px 0">
    <div class="list" id="pl" style="max-height:50vh;overflow:auto">${rows.map(({ p, c }) => html`
      <button class="list-item" style="width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);cursor:pointer" data-close="${p.id}" data-name="${(c.name + " " + (c.code || "")).toLowerCase()}">
        <div class="grow"><b>${c.name}</b>${p.clientId === clientId ? html` <span class="badge teal">this client</span>` : ""}
          <div class="small muted">${label(p)} · ${fmtDate(p.startDate, { year: true })} · ${typeLabel(p)}${c.code ? ` · ${c.code}` : ""}</div></div></button>`)}</div>
    <div class="actions"><button class="btn ghost" data-close="">Cancel</button></div>`), {
    onMount(el) { el.querySelector("#pq").addEventListener("input", (e) => { const q = e.target.value.toLowerCase().trim();
      el.querySelectorAll("#pl [data-name]").forEach((r) => (r.hidden = q && !r.dataset.name.includes(q))); }); },
  });
  return id ? store.plan(id) : null;
}

// tplId: open the editor for a plan TEMPLATE ("new" or a template id) – same screen without client, dates, notes or call summary.
export default async function planEditor(ctx, planId, clientId, tplId) {
  const tpl = tplId !== undefined;
  let existingTpl = tpl && tplId !== "new" ? store.template(tplId) : null;
  if (tpl && tplId !== "new" && !existingTpl) { toast("That template was deleted"); ctx.goReplace("#/templates"); return; }
  let existing = planId ? store.plan(planId) : null;
  if (planId && !existing) { toast("That plan was deleted"); ctx.goReplace("#/clients"); return; }
  const client = tpl ? null : store.client(existing ? existing.clientId : clientId);
  if (!tpl && !client) { toast("That client was deleted"); ctx.goReplace("#/clients"); return; }
  ctx.back(tpl ? "#/templates" : `#/client/${client.id}`);

  // If the user leaves (e.g. phone Back) while a question pop-up is open, don't navigate or draw afterwards.
  const myHash = location.hash, left = () => location.hash !== myHash;
  let plan;
  if (tpl) {
    if (existingTpl) plan = { ...structuredClone(existingTpl), startDate: todayIso() };
    else {
      const pattern = await askPattern({ name: "this template" }, true);
      if (left()) return;
      if (!pattern) { ctx.goReplace("#/templates"); return; }
      const d = store.settings.defaults;
      plan = { name: "", pattern, days: 7, startDate: todayIso(), slotModes: {}, slotTimes: {}, meals: {}, exercise: structuredClone(d.exercise),
        servingSizes: structuredClone(d.servingSizes), guidelines: structuredClone(d.guidelines), recipeIds: [], pdfSections: { ...store.settings.pdfSections } };
    }
  }
  else if (existing) plan = structuredClone(existing);
  else {
    const today = store.data.plans.find((p) => p.createdAt && toIso(new Date(p.createdAt)) === todayIso() && isSameClient(store.client(p.clientId), client));
    if (today) {
      const r = await alreadyCreated(today, `A plan for ${client.name} was already created today.`, true);
      if (left()) return;
      if (r === "open") { ctx.goReplace(`#/plan/${today.id}`); return; }
      if (r !== "new") { ctx.goReplace(`#/client/${client.id}`); return; }
    }
    let pattern = client.mealPattern;
    if (!pattern || !store.settingsRO.mealPatterns[pattern]) {   // not set yet, or that type was deleted: ask
      pattern = await askPattern(client);
      if (left()) return;
      if (!pattern) { ctx.goReplace(`#/client/${client.id}`); return; }
      client.mealPattern = pattern; await store.upsertClient(client);
    }
    plan = newPlanFor(client, pattern);
    // How to start: blank, from a template or by copying another plan (asked only when there is something to use)
    const hasT = (store.data.templates || []).length, hasP = store.data.plans.length;
    while (hasT || hasP) {
      const how = await modal(String(html`<h2>How do you want to start?</h2>
        <div class="stack" style="margin-top:10px">
          <button class="choice" data-close="blank"><span class="big">${icon("plus")}</span><span><b>Blank plan</b><span class="small muted">Start with empty meals</span></span></button>
          ${hasT ? html`<button class="choice" data-close="tpl"><span class="big">${icon("book")}</span><span><b>From a template</b><span class="small muted">${hasT} saved template${hasT > 1 ? "s" : ""}</span></span></button>` : ""}
          ${hasP ? html`<button class="choice" data-close="copy"><span class="big">${icon("copy")}</span><span><b>Copy another plan</b><span class="small muted">Any client's saved plan</span></span></button>` : ""}
        </div>
        <div class="actions"><button class="btn ghost" data-close="">Cancel</button></div>`));
      if (left()) return;
      if (!how) { ctx.goReplace(`#/client/${client.id}`); return; }
      if (how === "blank") break;
      const src = how === "tpl" ? await pickTemplate() : await pickPlan(store.data.plans, client.id);
      if (left()) return;
      if (!src) continue;   // cancelled the list: ask again
      applySource(plan, src, how === "tpl");
      toast((how === "tpl" ? `Started from “${src.name}”. Change what you need, then Save.` : "Copied. Dates and call summary were not copied.") + typeNote(plan, src, client), 4500);
      break;
    }
  }
  plan.slotModes ||= {}; plan.slotTimes ||= {}; plan.meals ||= {};
  // older or hand-edited plans may miss lists: fill them so the editor never breaks
  plan.exercise = (plan.exercise || []).filter(Boolean); plan.servingSizes = plan.servingSizes || [];
  plan.guidelines = (plan.guidelines || []).map((g) => ({ type: "prefer", title: "", ...g, items: g.items || [] }));
  plan.days = Math.min(Math.max(+plan.days || 7, 1), 7);
  plan.pdfSections ||= { ...store.settings.pdfSections, ...(plan.callSummary && "includeInPdf" in plan.callSummary ? { callSummary: !!plan.callSummary.includeInPdf } : {}) };
  const otherPlans = () => store.data.plans.filter((p) => p.id !== plan.id);
  let patternChosen = false;
  const timesChanged = new Set();   // meal times changed on this screen → become the client's own timings
  let dirty = !existing, mode = local.get("planView", matchMedia("(min-width: 900px)").matches ? "meal" : "day");
  store._editorDirty = dirty;
  const markDirty = () => { dirty = true; store._editorDirty = true; };
  ctx.guard(async () => !dirty || confirmBox("Leave without saving?", `Your changes to this ${tpl ? "template" : "plan"} will be lost.`, "Leave"));
  ctx.onCleanup(() => { store._editorDirty = false; });

  const dates = () => Array.from({ length: plan.days }, (_, i) => addDaysIso(plan.startDate, i));
  const meal = (id) => (plan.meals[id] ||= { shared: "", days: [] });
  const cs = () => (plan.callSummary ||= { date: todayIso(), text: "", includeInPdf: false });
  const title = () => (plan.days === 7 && plan.weekNumber ? `Week ${plan.weekNumber}` : `${plan.days}-Day Plan`);
  const s = store.settings;

  // "Show in PDF" tick shown in each section's header
  const pdfTick = (key, label = "Show in PDF") => html`<label class="pdf-tick"><input type="checkbox" data-sec="${key}" ${plan.pdfSections[key] !== false ? "checked" : ""}> ${label}</label>`;
  const ta = (bind, value, ph, rows = 2) => html`<textarea data-bind="${bind}" rows="${rows}" placeholder="${ph || "Type or pick a meal…"}" data-ac="1">${value || ""}</textarea>`;
  const slotIcon = (sl) => icon(sl.icon);

  function render() {
    ctx.title(tpl ? (existingTpl ? "Edit template" : "New template") : existing ? title() : "New plan");
    const ds = dates(), slots = planSlots(plan);
    const shared = slots.filter((x) => x.mode === "shared"), daily = slots.filter((x) => x.mode === "daily");
    const dayLabel = (d, i) => (tpl ? `Day ${i + 1}` : `${wd(d)} ${fmtDate(d)}`);

    const slotCard = (sl) => { const m = meal(sl.id); return html`
      <div class="card slot-card" style="--accent:${sl.accent}">
        <div class="slot-head">
          <div class="slot-name">${slotIcon(sl)} ${sl.name}</div>
          ${tpl ? "" : html`<input type="time" data-time="${sl.id}" value="${to24(sl.time)}" aria-label="${sl.name} time">`}
          <div class="seg" data-mode="${sl.id}"><button type="button" data-v="daily" class="${sl.mode === "daily" ? "on" : ""}">Daily</button><button type="button" data-v="shared" class="${sl.mode === "shared" ? "on" : ""}">Same all days</button></div>
        </div>
        ${sl.mode === "shared" ? ta(`shared:${sl.id}`, m.shared, "Same for every day…")
          : html`<div class="day-grid" style="--cols:${Math.min(plan.days, 7)}">${ds.map((d, i) => html`
              <div class="day-cell"><div class="day-lbl">${dayLabel(d, i)}</div>${ta(`day:${sl.id}:${i}`, m.days[i], "", 3)}</div>`)}</div>`}
      </div>`; };


    const byMeal = html`${slots.map(slotCard)}`;
    const byDay = html`
      ${shared.length ? html`<div class="card"><h2>Same every day</h2><div class="stack">${shared.map((sl) => html`
        <div class="slot-line" style="--accent:${sl.accent}"><div class="row between"><span class="lbl">${sl.name}</span>
          <span class="row" style="gap:6px">${tpl ? "" : html`<input type="time" data-time="${sl.id}" value="${to24(sl.time)}" style="width:136px;min-height:34px;padding:4px 8px">`}
          <button type="button" class="btn small ghost" data-flip="${sl.id}" title="Make it different each day">Daily</button></span></div>
          ${ta(`shared:${sl.id}`, meal(sl.id).shared, "Same for every day…")}</div>`)}</div></div>` : ""}
      ${ds.map((d, i) => html`<div class="card day-card">
        <div class="day-title"><h2>${tpl ? `Day ${i + 1}` : html`${wd(d)} <span class="muted small">${fmtDate(d)}</span>`}</h2></div>
        ${daily.map((sl) => html`<div class="slot-line" style="--accent:${sl.accent}"><div class="row between"><span class="lbl">${sl.name} ${tpl ? "" : html`<span class="muted tiny">${sl.time}</span>`}</span>
          ${i === 0 ? html`<button type="button" class="btn small ghost" data-flip="${sl.id}" title="Use one meal for all days">Same all days</button>` : ""}</div>
          ${ta(`day:${sl.id}:${i}`, meal(sl.id).days[i], "")}</div>`)}
      </div>`)}`;

    ctx.view().innerHTML = String(html`
    <div class="card">
      <div class="row between wrap">
        ${tpl ? html`<div style="flex:1 1 100%"><div class="eyebrow">Plan template</div>
          <label class="field" style="margin-top:6px"><span>Template name</span><input type="text" id="tplName" value="${plan.name || ""}" placeholder="e.g. PCOD 1400 kcal – veg"></label></div>`
        : html`<div><div class="eyebrow">${client.name}</div><h2 style="margin:2px 0 0">${title()}</h2>
          <div class="title-preview">${fmtDate(ds[0], { weekday: true })} – ${fmtDate(ds.at(-1), { weekday: true, year: true })}</div>
          ${(() => { const h = (store.client(client.id)?.program?.holds || []).find((x) => !(ds.at(-1) < x.from || ds[0] > x.to));
            return h ? html`<div class="small" style="color:var(--amber);margin-top:4px">Note: overlaps a hold (${fmtDate(h.from)} – ${fmtDate(h.to)})</div>` : ""; })()}</div>`}
        <div class="seg" id="pattern">${Object.entries(s.mealPatterns).map(([k, p]) => html`<button type="button" data-v="${k}" class="${plan.pattern === k ? "on" : ""}">${p.label}</button>`)}
          ${s.mealPatterns[plan.pattern] ? "" : html`<button type="button" data-v="${plan.pattern}" class="on" title="This plan type was removed from Settings">${plan.patternSnapshot ? `${plan.patternSnapshot.label} (removed type, saved copy)` : `Removed type (shown as ${typeLabel(plan)})`}</button>`}</div>
      </div>
      <div class="form-grid" style="margin-top:14px">
        ${tpl ? "" : html`<label class="field half"><span>Start date</span><input type="date" id="start" value="${plan.startDate}"></label>`}
        <label class="field half" ${plan.days === 7 && !tpl ? "" : "hidden"}><span>Week number</span><input type="number" id="week" min="1" value="${plan.weekNumber || ""}" inputmode="numeric"></label>
        <div class="full"><span class="field-label">Number of days</span>
          <div class="seg" id="days">${[1, 2, 3, 4, 5, 6, 7].map((n) => html`<button type="button" data-v="${n}" class="${plan.days === n ? "on" : ""}">${n}</button>`)}</div></div>
      </div>
      <div class="row wrap" style="margin-top:12px">
        ${otherPlans().length ? html`<button type="button" class="btn small line" id="copyAny">${icon("copy")} Copy another plan…</button>` : ""}
        ${(store.data.templates || []).filter((x) => x.id !== plan.id).length ? html`<button type="button" class="btn small line" id="fromTpl">${icon("book")} ${tpl ? "Copy a template…" : "From template…"}</button>` : ""}</div>
    </div>

    ${tpl ? "" : html`<div class="section-title"><h2>Cover page</h2><span class="small muted">Tick what the PDF cover shows</span></div>
    <div class="card"><div class="chips">
      ${pdfTick("clientId", "Client ID")} ${pdfTick("program", "Program dates")} ${pdfTick("statTiles", "Age, height, blood group, BMI")} ${pdfTick("weightProgress", "Weight progress & chart")}
      ${pdfTick("measurements", "Body measurements")} ${pdfTick("health", "Health card")} ${pdfTick("food", "Food card")}</div></div>`}

    <div class="section-title"><h2>Meals</h2>
      <div class="seg" id="viewMode"><button type="button" data-v="day" class="${mode === "day" ? "on" : ""}">By day</button><button type="button" data-v="meal" class="${mode === "meal" ? "on" : ""}">By meal</button></div></div>
    ${mode === "meal" ? byMeal : byDay}
    ${tpl ? html`<p class="small muted" style="margin:10px 2px 0">A template keeps only the meal plan. Exercise, serving guide, guidelines, recipes and PDF choices come from your Settings defaults when a client's plan is started from it, and can be changed there.</p>` : html`<label class="card weight-opt"><input type="checkbox" data-sec="weightRow" ${plan.pdfSections.weightRow !== false ? "checked" : ""}>
      <span><b>${icon("scale")} Show daily weight row in PDF</b><span class="small muted">Adds a "Weight" row at the bottom of the meal table with the weights logged on the client page for these dates. The PNG never shows weights.</span></span></label>

    <div class="section-title"><h2>Exercise</h2>${pdfTick("exercise")}<button type="button" class="btn small ghost" id="addEx">${icon("plus")} Add</button></div>
    <div class="card rows">${plan.exercise.length ? plan.exercise.map((e, i) => html`
      <div class="row-item"><input type="text" data-bind="ex:${i}:text" value="${e.text}" placeholder="Exercise">
        <input type="text" data-bind="ex:${i}:duration" value="${e.duration}" placeholder="20 mins">
        <button type="button" class="icon-btn danger" data-delex="${i}" aria-label="Remove">${icon("trash")}</button></div>
      <details class="more" style="margin:-2px 0 10px"><summary>${icon("link")} Video link ${e.link ? "✓" : ""}</summary>
        <input type="url" data-bind="ex:${i}:link" value="${e.link || ""}" placeholder="https://… (saved, not shown in PDF for now)" style="margin-top:6px"></details>`)
      : html`<div class="empty small">No exercise added.</div>`}</div>

    <div class="section-title"><h2>Serving guide</h2>${pdfTick("servingGuide")}<button type="button" class="btn small ghost" id="addSv">${icon("plus")} Add</button></div>
    <div class="card rows">${plan.servingSizes.map((x, i) => html`
      <div class="row-item three"><input type="text" data-bind="sv:${i}:value" value="${x.value}" placeholder="5 g">
        <input type="text" data-bind="sv:${i}:label" value="${x.label}" placeholder="1 Teaspoon">
        <button type="button" class="icon-btn danger" data-delsv="${i}" aria-label="Remove">${icon("trash")}</button></div>`)}</div>

    <div class="section-title"><h2>Guidelines</h2>${pdfTick("guidelines")}</div>
    <div class="grid two">${plan.guidelines.map((g, i) => html`
      <div class="card"><h3 style="color:${g.type === "avoid" ? "var(--coral)" : "var(--green)"};margin-bottom:8px">${g.title}</h3>
        <textarea data-bind="gl:${i}" rows="6" placeholder="One item per line">${g.items.join("\n")}</textarea></div>`)}</div>

    <div class="section-title"><h2>Allowed food</h2>${pdfTick("allowedFood")}</div>
    <div class="card"><textarea data-bind="allowed" rows="5" placeholder="One per line, e.g. Lauki, Tinda, Palak / Apple, Papaya, Guava">${(plan.allowedFood || []).join("\n")}</textarea>
      ${(plan.allowedFood || []).length ? "" : html`<p class="tiny muted" style="margin:6px 0 0">Set a default list in Settings → Defaults so every new plan starts with it.</p>`}</div>

    <div class="section-title"><h2>Recipes</h2>${pdfTick("recipes")}<button type="button" class="btn small ghost" id="addRecipe">${icon("plus")} Add</button></div>
    <div class="card">${(plan.recipeIds || []).length ? html`<div class="chips">${plan.recipeIds.map((rid) => { const r = store.recipe(rid); return r ? html`
        <span class="chip on" style="cursor:default">${r.name} <button type="button" class="icon-btn" data-rmrecipe="${rid}" aria-label="Remove ${r.name}" style="width:24px;height:24px;margin:-4px -6px -4px 2px">${icon("x")}</button></span>` : ""; })}</div>
        <p class="tiny muted" style="margin:8px 0 0">Printed as recipe pages at the end of the plan PDF.</p>`
      : html`<div class="empty small">No recipes added. ${store.data.recipes.length ? "Tap “Add” to choose from your recipes." : html`Create recipes under <a href="#/recipes">Meals → Recipes</a>.`}</div>`}</div>`}

    ${tpl ? "" : html`<div class="section-title"><h2>Call summary</h2>${pdfTick("callSummary")}</div>
    <div class="card">
      <div class="form-grid">
        <label class="field half"><span>Call date</span><input type="date" id="csDate" value="${plan.callSummary?.date || todayIso()}"></label>
        <label class="field full"><span>What was discussed</span><textarea data-bind="cs" rows="4" placeholder="Progress, concerns, changes agreed…">${plan.callSummary?.text || ""}</textarea></label>
      </div>
    </div>

    <div class="section-title"><h2>Notes for the client</h2>${pdfTick("clientNotes")}</div>
    <div class="card"><textarea data-bind="notes" rows="3" placeholder="Optional – shown under the meal table">${plan.notes || ""}</textarea>
      <label class="inline-check" style="margin-top:12px"><input type="checkbox" id="remind" ${plan.reminder !== false ? "checked" : ""}>
        <span>Remind me ${s.reminders.planEndDaysBefore} day before this plan ends${calendarReady() ? " (Google Calendar)" : ""}</span></label>
      ${calendarReady() ? "" : html`<p class="tiny muted" style="margin:6px 0 0">Connect Google in Settings for phone alerts. Ending plans always show on the Today screen.</p>`}
    </div>`}

    <div class="action-bar">
      ${tpl ? html`<button type="button" class="btn teal" id="save">${icon("check")} Save template</button>`
      : html`<button type="button" class="btn line" id="save">${icon("check")} Save</button>
      <button type="button" class="btn teal" id="saveExport">${icon("download")} Save & export</button>`}
    </div>`);

    const v = ctx.view();
    v.querySelectorAll("textarea[data-ac]").forEach((t) => { attachAutocomplete(t); autoGrow(t); });
    v.querySelectorAll("textarea:not([data-ac])").forEach(autoGrow);
  }

  // ---------- events (delegated; survive re-render) ----------
  const v = ctx.view();
  v.oninput = (e) => {
    const t = e.target, b = t.dataset.bind;
    if (t.dataset.time) { plan.slotTimes[t.dataset.time] = to12(t.value); timesChanged.add(t.dataset.time); markDirty(); return; }
    if (t.id === "week") { plan.weekNumber = +t.value || null; markDirty(); return; }
    if (t.id === "tplName") { plan.name = t.value; markDirty(); return; }
    if (!b) return;
    markDirty();
    const [kind, a, c] = b.split(":");
    if (kind === "shared") meal(a).shared = t.value;
    else if (kind === "day") { const m = meal(a); m.days[+c] = t.value; }
    else if (kind === "ex") plan.exercise[+a][c] = t.value;
    else if (kind === "sv") plan.servingSizes[+a][c] = t.value;
    else if (kind === "gl") plan.guidelines[+a].items = t.value.split("\n").map((x) => x.trim()).filter(Boolean);
    else if (kind === "notes") plan.notes = t.value;
    else if (kind === "allowed") plan.allowedFood = t.value.split("\n").map((x) => x.trim()).filter(Boolean);
    else if (kind === "cs") cs().text = t.value;
  };
  v.onchange = (e) => {
    if (e.target.id === "start" && e.target.value) { plan.startDate = e.target.value; markDirty(); render(); }
    if (e.target.id === "remind") { plan.reminder = e.target.checked; markDirty(); }
    if (e.target.id === "csDate") { cs().date = e.target.value; markDirty(); }
    if (e.target.dataset.sec) {
      plan.pdfSections[e.target.dataset.sec] = e.target.checked; markDirty();
      if (e.target.dataset.sec === "callSummary") cs().includeInPdf = e.target.checked;
      v.querySelectorAll(`[data-sec="${e.target.dataset.sec}"]`).forEach((x) => (x.checked = e.target.checked)); // keep both ticks in step
    }
  };
  v.onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const seg = b.parentElement;
    if (seg.id === "days") { plan.days = +b.dataset.v; markDirty(); return render(); }
    if (seg.id === "viewMode") { mode = b.dataset.v; local.set("planView", mode); return render(); }
    if (seg.id === "pattern" && b.dataset.v !== plan.pattern) {
      patternChosen = true;
      plan.pattern = b.dataset.v; markDirty(); render();   // Daily / Same choices are kept per section
      return toast(`Switched to ${typeLabel(plan)}. Your entries are kept.`);
    }
    if (seg.dataset.mode) { plan.slotModes[seg.dataset.mode] = b.dataset.v; markDirty(); return render(); }
    if (b.dataset.flip) {
      const sl = planSlots(plan).find((x) => x.id === b.dataset.flip);
      plan.slotModes[sl.id] = sl.mode === "daily" ? "shared" : "daily"; markDirty(); return render();
    }
    if (b.id === "addRecipe") {
      const ids = await pickRecipes(plan);
      if (ids) { plan.recipeIds = ids; markDirty(); render(); }
      return;
    }
    if (b.dataset.rmrecipe) { plan.recipeIds = (plan.recipeIds || []).filter((x) => x !== b.dataset.rmrecipe); markDirty(); return render(); }
    if (b.id === "addEx") { plan.exercise.push({ text: "", duration: "", link: "" }); markDirty(); return render(); }
    if (b.dataset.delex) { const x = plan.exercise[+b.dataset.delex];
      if ((x.text || x.duration) && !(await confirmBox("Remove this exercise?", `“${x.text || x.duration}” will be removed from this plan.`, "Remove"))) return;
      plan.exercise.splice(+b.dataset.delex, 1); markDirty(); return render(); }
    if (b.id === "addSv") { plan.servingSizes.push({ value: "", label: "" }); markDirty(); return render(); }
    if (b.dataset.delsv) { const x = plan.servingSizes[+b.dataset.delsv];
      if ((x.value || x.label) && !(await confirmBox("Remove this serving size?", `“${[x.value, x.label].filter(Boolean).join(" = ")}” will be removed from this plan.`, "Remove"))) return;
      plan.servingSizes.splice(+b.dataset.delsv, 1); markDirty(); return render(); }
    if (b.id === "copyAny") {
      const src = await pickPlan(otherPlans(), client?.id);
      if (!src) return;
      if (hasContent(plan) && !(await confirmBox("Replace what's here?", "The meals, exercise, serving sizes, guidelines and recipes on this screen will be replaced by the copied plan.", "Replace", false))) return;
      applySource(plan, src);
      markDirty(); render(); return toast("Copied. Dates and call summary were not copied." + typeNote(plan, src, client), 4500);
    }
    if (b.id === "fromTpl") {
      const src = await pickTemplate(plan.id); if (!src) return;
      if (Object.values(plan.meals || {}).some((m) => m && (m.shared || (m.days || []).some(Boolean))) && !(await confirmBox("Replace the meals?", "The meals on this screen will be replaced by the template's meals. Exercise, guidelines and the rest stay as they are.", "Replace", false))) return;
      applySource(plan, src, true); markDirty(); render(); return toast(`Template “${src.name}” applied.` + typeNote(plan, src, client), 4500);
    }
    if (b.id === "save" || b.id === "saveExport") {
      b.disabled = true;
      try { const saved = await save(); if (saved && b.id === "saveExport") openExport(client, renderablePlan(saved), { onWeightRow: (on) => { plan.pdfSections.weightRow = on; v.querySelectorAll('[data-sec="weightRow"]').forEach((x) => (x.checked = on)); } }); }
      finally { b.disabled = false; }
    }
  };

  async function saveTemplate() {
    const name = String(plan.name || "").trim();
    if (!name) { toast("Please enter the template name"); v.querySelector("#tplName")?.focus(); return null; }
    if ((store.data.templates || []).some((x) => x.id !== plan.id && normText(x.name) === normText(name))) { toast("Another template has that name"); v.querySelector("#tplName")?.focus(); return null; }
    if (!mealCount(plan)) { toast("Type some meals first"); return null; }
    const t = templateFromPlan(structuredClone(plan), name);
    if (existingTpl) { t.id = existingTpl.id; t.createdAt = existingTpl.createdAt; }
    const learned = store.learnMeals(Object.values(plan.meals).flatMap((m) => [m.shared, ...(m.days || []).slice(0, plan.days)]).map((x) => (typeof x === "object" && x ? x.text : x)).filter(Boolean));
    const saved = await store.upsertTemplate(t);
    dirty = false; store._editorDirty = false;
    plan = { ...plan, ...structuredClone(saved) };   // keep the editor's working fields
    toast(`Template “${saved.name}” saved${learned ? ` · ${learned} new meal${learned > 1 ? "s" : ""} added to your list` : ""}`);
    if (!existingTpl) { existingTpl = saved; ctx.replace(`#/template/${saved.id}`); }
    render(); return saved;
  }

  async function save() {
    if (tpl) return saveTemplate();
    if (!plan.startDate) { toast("Pick a start date"); return null; }
    const dup = duplicateOf(plan, client);
    if (dup) {
      if ((await alreadyCreated(dup, `${client.name} already has a plan starting ${fmtDate(plan.startDate, { weekday: true, year: true })}.`)) === "open") {
        ctx.go(`#/plan/${dup.id}`);   // the normal "Leave without saving?" check protects what was typed here
      }
      return null;
    }
    // 1) meals typed in visible slots go into the shared meal list
    const texts = [];
    for (const sl of planSlots(plan)) {
      const m = meal(sl.id);
      if (sl.mode === "shared") texts.push(m.shared); else texts.push(...m.days.slice(0, plan.days));
    }
    const learned = store.learnMeals(texts.filter(Boolean));
    const fresh = store.client(client.id) || client;     // latest copy (another device may have added weights)
    // the client's plan type follows the type you chose here – but never a type that no longer exists in Settings,
    // and never just because a template/copied plan used another type
    if (store.settingsRO.mealPatterns[plan.pattern] && (patternChosen || !fresh.mealPattern)) fresh.mealPattern = plan.pattern;
    // the client's timings: all of this plan's times the first time, afterwards only the times changed here
    const planTimes = Object.fromEntries(planSlots(plan).map((x) => [x.id, x.time]));
    if (!fresh.slotTimes) fresh.slotTimes = planTimes;
    else for (const [id, t] of Object.entries(planTimes)) if (timesChanged.has(id) || !(id in fresh.slotTimes)) fresh.slotTimes[id] = t;
    timesChanged.clear();
    await store.upsertClient(fresh);
    plan.exercise = plan.exercise.filter((x) => String(x.text || "").trim());
    plan.servingSizes = plan.servingSizes.filter((x) => String(x.value || "").trim() || String(x.label || "").trim());
    snapshotType(plan);
    let saved = await store.upsertPlan(plan);
    // 3) reminder in Google Calendar
    try {
      if (plan.reminder !== false) {
        const id = await pushReminder(planEndReminder(saved, client), saved.reminderEventId);
        if (id && id !== saved.reminderEventId) { saved.reminderEventId = id; saved = await store.upsertPlan(saved); }
      } else if (saved.reminderEventId) { const old = saved.reminderEventId; saved.reminderEventId = null; saved = await store.upsertPlan(saved); await removeReminder(old); }
    } catch (e) { if (e.saveFailed) throw e; toast("Plan saved, but the calendar reminder failed: " + e.message, 4500); }
    dirty = false; store._editorDirty = false;
    plan = structuredClone(saved);     // keep editing a private copy; "Leave without saving" then really discards
    toast(`Plan saved${learned ? ` · ${learned} new meal${learned > 1 ? "s" : ""} added to your list` : ""}`);
    if (!existing) { existing = saved; ctx.replace(`#/plan/${saved.id}`); }
    render();     // redraw so the screen matches what was saved (empty rows removed)
    return saved;
  }

  render();
}
