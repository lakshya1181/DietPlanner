// One shared meal list for every slot. Meals typed in plans are added automatically.
import { store, normText } from "../store.js";
import { html, icon, toast, modal, confirmBox } from "../ui.js";
import { openRecipeExport } from "./exportDialog.js";

const tabs = (on) => html`<div class="seg" style="margin-bottom:12px"><a class="seg-a ${on === "meals" ? "on" : ""}" href="#/library">Meal list</a><a class="seg-a ${on === "recipes" ? "on" : ""}" href="#/recipes">Recipes</a><a class="seg-a ${on === "templates" ? "on" : ""}" href="#/templates">Templates</a></div>`;

export default function library(ctx, tab) {
  if (tab === "recipes") return recipesList(ctx);
  if (tab === "templates") return templatesList(ctx);
  ctx.title("Meal list");
  let q = "", sort = "uses";
  const v = ctx.view();
  v.innerHTML = String(html`${tabs("meals")}
    <p class="small muted" style="margin:0 2px 12px">Every meal you type in a plan is saved here automatically and suggested while typing in any slot.</p>
    <div class="row" style="margin-bottom:12px"><input type="search" id="q" placeholder="Search meals" class="grow">
      <div class="seg" id="sort"><button data-v="uses" class="on">Most used</button><button data-v="az">A–Z</button></div></div>
    <div class="card"><div class="list" id="list"></div></div>
    <button class="btn fab" id="add">${icon("plus")} Add meal</button>`);
  const draw = () => {
    const n = normText(q), used = store.mealUsage(), u = (m) => used.get(normText(m.text)) || 0;
    const rows = store.data.library.filter((m) => !n || normText(m.text).includes(n))
      .sort((a, b) => (sort === "az" ? a.text.localeCompare(b.text) : u(b) - u(a) || a.text.localeCompare(b.text)));
    v.querySelector("#list").innerHTML = rows.length ? String(html`${rows.map((m) => html`
      <div class="list-item"><div class="grow"><div>${m.text}</div>
        <div class="tiny muted">${u(m) ? `In ${u(m)} plan${u(m) > 1 ? "s" : ""}` : "Not in any saved plan"}${m.link ? " · has link" : ""}</div></div>
        <button class="icon-btn" data-edit="${m.id}" aria-label="Edit">${icon("edit")}</button>
        <button class="icon-btn danger" data-del="${m.id}" aria-label="Delete">${icon("trash")}</button></div>`)}`)
      : String(html`<div class="empty">${icon("book")}<div>${store.data.library.length ? "No meals match." : "Your meal list is empty. Meals appear here after you save a plan."}</div></div>`);
  };
  async function edit(m) {
    const r = await modal(String(html`<h2>${m ? "Edit meal" : "Add meal"}</h2>
      <div class="stack" style="margin-top:12px">
        <label class="field"><span>Meal</span><textarea id="t" rows="2">${m?.text || ""}</textarea></label>
        <label class="field"><span>Recipe / video link (saved, not shown in PDF for now)</span><input type="url" id="l" value="${m?.link || ""}" placeholder="https://…"></label></div>
      <div class="actions"><button class="btn ghost" data-close="">Cancel</button><button class="btn teal" id="ok">Save</button></div>`),
      { onMount: (el, close) => { el.querySelector("#t").focus(); el.querySelector("#ok").onclick = () => {
        const text = el.querySelector("#t").value.trim(), link = el.querySelector("#l").value.trim();
        if (!text) { toast("Please type the meal"); return el.querySelector("#t").focus(); }   // stay open, keep the link
        if (store.data.library.some((x) => normText(x.text) === normText(text) && x.id !== m?.id)) { toast("That meal is already in the list"); return el.querySelector("#t").focus(); }
        close({ text, link }); }; } });
    if (!r || !r.text) return;
    await store.upsertMeal({ ...(m || {}), ...r }); toast("Saved"); draw();
  }
  v.querySelector("#q").addEventListener("input", (e) => { q = e.target.value; draw(); });
  v.querySelector("#sort").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; sort = b.dataset.v; v.querySelectorAll("#sort button").forEach((x) => x.classList.toggle("on", x === b)); draw(); });
  v.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "add") return edit(null);
    if (b.dataset.edit) return edit(store.data.library.find((m) => m.id === b.dataset.edit));
    if (b.dataset.del && (await confirmBox("Delete meal?", "It will no longer be suggested. Existing plans are not changed. It goes to the Recycle bin (Settings) for 30 days."))) { await store.deleteMeal(b.dataset.del); draw(); }
  });
  draw();
}


// ---------- recipes ----------
function recipesList(ctx) {
  ctx.title("Recipes");
  let q = "";
  const picked = new Set();
  const v = ctx.view();
  v.innerHTML = String(html`${tabs("recipes")}
    <div class="row" style="margin-bottom:12px"><input type="search" id="q" placeholder="Search recipes, category or ingredient" class="grow"></div>
    <div class="card"><div class="list" id="list"></div></div>
    <div class="action-bar" id="pickBar" hidden><span class="grow small" id="pickN"></span>
      <button class="btn ghost" id="clearPick" style="flex:none">Clear</button><button class="btn teal" id="pdfPick">${icon("file")} PDF of selected</button></div>
    <a class="btn fab" href="#/recipe/new" id="fabNew">${icon("plus")} New recipe</a>`);
  const draw = () => {
    const n = normText(q);
    const rows = store.data.recipes.filter((r) => !n || [r.name, r.category, ...(Array.isArray(r.ingredients) ? r.ingredients : [r.ingredients])].some((x) => normText(x).includes(n)))
      .sort((a, b) => a.name.localeCompare(b.name));
    v.querySelector("#list").innerHTML = rows.length ? String(html`${rows.map((r) => html`
      <div class="list-item">
        <input type="checkbox" data-pick="${r.id}" ${picked.has(r.id) ? "checked" : ""} aria-label="Select ${r.name}" style="width:20px;height:20px;accent-color:var(--teal)">
        ${r.photo ? html`<img src="${r.photo}" alt="" style="width:46px;height:46px;object-fit:cover;border-radius:10px">` : html`<div class="avatar" style="background:var(--teal-soft);color:var(--teal)">${icon("bowl")}</div>`}
        <a class="grow" href="#/recipe/${r.id}" style="text-decoration:none;color:inherit"><b>${r.name}</b>
          <div class="tiny muted">${[r.category, r.pref, r.servings && `Serves ${r.servings}`, r.link && "has link"].filter(Boolean).join(" · ")}</div></a>
        <button class="icon-btn" data-pdf="${r.id}" aria-label="PDF">${icon("file")}</button></div>`)}`)
      : String(html`<div class="empty">${icon("book")}<div>${store.data.recipes.length ? "No recipes match." : "No recipes yet. Tap “New recipe” to add your first one."}</div></div>`);
    const bar = v.querySelector("#pickBar"); bar.hidden = !picked.size; v.querySelector("#fabNew").hidden = !!picked.size;
    v.querySelector("#pickN").textContent = `${picked.size} selected`;
  };
  v.querySelector("#q").addEventListener("input", (e) => { q = e.target.value; draw(); });
  v.addEventListener("change", (e) => { const id = e.target.dataset.pick; if (!id) return; e.target.checked ? picked.add(id) : picked.delete(id); draw(); });
  v.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.pdf) return openRecipeExport([store.recipe(b.dataset.pdf)]);
    if (b.id === "clearPick") { picked.clear(); return draw(); }
    if (b.id === "pdfPick") return openRecipeExport([...picked].map((id) => store.recipe(id)).filter(Boolean));
  });
  draw();
}


// ---------- plan templates ----------
function templatesList(ctx) {
  ctx.title("Plan templates");
  let q = "";
  const v = ctx.view();
  v.innerHTML = String(html`${tabs("templates")}
    <p class="small muted" style="margin:0 2px 12px">Ready-made plans you can start a client's plan from (“From a template” when creating a plan). Tap a template to change its name or meals.</p>
    <div class="row" style="margin-bottom:12px"><input type="search" id="q" placeholder="Search templates" class="grow"></div>
    <div class="card"><div class="list" id="list"></div></div>
    <a class="btn fab" href="#/template/new" id="fabTpl">${icon("plus")} New template</a>`);
  const s = store.settingsRO;
  const preview = (t) => { const pat = DietRender.patternOf(t, s); if (!pat) return "";
    return pat.slots.map((sl) => { const m = (t.meals || {})[sl.id] || {}, mode = (t.slotModes || {})[sl.id] || sl.mode;
      const txt = mode === "shared" ? m.shared : (m.days || []).slice(0, t.days).filter(Boolean).map((x) => (typeof x === "object" ? x.text : x)).join(" / ");
      return txt ? `${DietRender.slotInfo(sl.id, t, s).name}: ${txt}` : ""; }).filter(Boolean); };
  const draw = () => {
    const n = normText(q);
    const rows = [...(store.data.templates || [])].filter((t) => !n || normText(t.name).includes(n)).sort((a, b) => a.name.localeCompare(b.name));
    v.querySelector("#list").innerHTML = rows.length ? String(html`${rows.map((t) => html`
      <div class="list-item" style="align-items:flex-start"><div class="grow"><a href="#/template/${t.id}" style="color:inherit;text-decoration:none"><b>${t.name}</b></a>
        <div class="small muted">${DietRender.patternOf(t, s)?.label || ""} · ${t.days} day${t.days > 1 ? "s" : ""}</div>
        <details class="more" style="margin-top:4px"><summary class="small">Meals</summary><ul class="small" style="margin:6px 0 0;padding-left:18px">${preview(t).map((x) => html`<li>${x}</li>`)}</ul></details></div>
        <a class="icon-btn" href="#/template/${t.id}" data-edit-tpl="${t.id}" aria-label="Edit">${icon("edit")}</a>
        <button class="icon-btn danger" data-del="${t.id}" aria-label="Delete">${icon("trash")}</button></div>`)}`)
      : String(html`<div class="empty">${icon("book")}<div>${(store.data.templates || []).length ? "No templates match." : "No templates yet. Tap “New template” to make one."}</div></div>`);
  };
  v.querySelector("#q").addEventListener("input", (e) => { q = e.target.value; draw(); });
  v.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.del) {
      const t = store.template(b.dataset.del);
      if (!(await confirmBox("Delete template?", `“${t.name}” will be removed. Plans made from it are not changed. It goes to the Recycle bin (Settings) for 30 days.`))) return;
      await store.deleteTemplate(t.id); toast("Template deleted"); return draw();
    }
  });
  draw();
}
