// Recipe editor: name, category, food type, servings, times, ingredients, method, tips, nutrition, photo, optional link.
import { store, normText } from "../store.js";
import { html, icon, toast, confirmBox, autoGrow } from "../ui.js";
import { openRecipeExport } from "./exportDialog.js";

// Shrink a photo so recipes stay small in storage and in the Drive copy (max 900 px, JPEG).
async function shrinkPhoto(file) {
  const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
  const img = new Image(); img.src = url; await img.decode();
  const k = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

export default function recipeEditor(ctx, id) {
  const s = store.settingsRO;
  let existing = id ? store.recipe(id) : null;
  if (id && !existing) { toast("That recipe was deleted"); ctx.goReplace("#/recipes"); return; }
  const r = existing ? structuredClone(existing) : { name: "", category: "", pref: s.foodPreferences[0]?.label || "", servings: "", prepTime: "", cookTime: "",
    ingredients: "", steps: "", tips: "", link: "", photo: null, nutrition: {} };
  r.nutrition ||= {};
  ctx.title(existing ? "Edit recipe" : "New recipe");
  ctx.back("#/recipes");
  let dirty = false;
  const mark = () => { dirty = true; store._editorDirty = true; };
  store._editorDirty = false;
  ctx.guard(async () => !dirty || confirmBox("Leave without saving?", "Your changes to this recipe will be lost.", "Leave"));
  ctx.onCleanup(() => { store._editorDirty = false; });
  const cats = [...new Set(store.data.recipes.map((x) => x.category).filter(Boolean))];
  const lines = (a) => (Array.isArray(a) ? a.join("\n") : a || "");

  const v = ctx.view();
  const render = () => {
    v.innerHTML = String(html`
    <form id="f" autocomplete="off">
      <div class="card"><h2>Recipe</h2>
        <div class="form-grid">
          <label class="field full"><span>Recipe name *</span><input type="text" name="name" value="${r.name}"></label>
          <label class="field half"><span>Category</span><input type="text" name="category" value="${r.category}" list="cats" placeholder="e.g. Breakfast, Soup, Snack">
            <datalist id="cats">${cats.map((c) => html`<option value="${c}"></option>`)}</datalist></label>
          <div class="full"><span class="field-label">Food type</span><div class="seg" data-seg="pref">${s.foodPreferences.map((p) => html`<button type="button" data-v="${p.label}" class="${r.pref === p.label ? "on" : ""}">${p.label}</button>`)}</div></div>
          <label class="field"><span>Serves</span><input type="number" name="servings" min="1" value="${r.servings}" inputmode="numeric"></label>
          <label class="field"><span>Prep time</span><input type="text" name="prepTime" value="${r.prepTime}" placeholder="10 min"></label>
          <label class="field half"><span>Cook time</span><input type="text" name="cookTime" value="${r.cookTime}" placeholder="15 min"></label>
        </div></div>

      <div class="card"><h2>Photo <span class="small muted">(optional)</span></h2>
        ${r.photo ? html`<img src="${r.photo}" alt="Recipe photo" style="max-height:220px;border-radius:12px;display:block;margin-bottom:10px">` : ""}
        <div class="row wrap"><label class="btn small ghost">${icon("image")} ${r.photo ? "Change photo" : "Add photo"}<input type="file" id="photo" accept="image/*" hidden></label>
          ${r.photo ? html`<button type="button" class="btn small ghost" id="noPhoto">Remove photo</button>` : ""}</div></div>

      <div class="grid two">
        <div class="card"><h2>Ingredients</h2><textarea name="ingredients" rows="8" placeholder="One per line, e.g.&#10;1 cup moong dal&#10;1 small onion, chopped">${lines(r.ingredients)}</textarea></div>
        <div class="card"><h2>Method</h2><textarea name="steps" rows="8" placeholder="One step per line">${lines(r.steps)}</textarea></div>
      </div>

      <div class="card"><h2>Nutrition per serving <span class="small muted">(optional)</span></h2>
        <div class="form-grid">${[["kcal", "Calories (kcal)"], ["protein", "Protein (g)"], ["carbs", "Carbs (g)"], ["fat", "Fat (g)"]].map(([k, l]) => html`
          <label class="field"><span>${l}</span><input type="number" step="0.1" min="0" data-nut="${k}" value="${r.nutrition[k] ?? ""}" inputmode="decimal"></label>`)}</div></div>

      <div class="card"><h2>Tips <span class="small muted">(optional)</span></h2><textarea name="tips" rows="2">${r.tips}</textarea></div>

      <div class="card"><h2>Recipe / video link <span class="small muted">(optional)</span></h2>
        <input type="url" name="link" value="${r.link}" placeholder="https://… (printed as a clickable button in the PDF)"></div>

      <div class="action-bar">
        ${existing ? html`<button type="button" class="btn ghost" id="del" style="flex:none">${icon("trash")}</button>` : ""}
        <button type="button" class="btn line" id="save">${icon("check")} Save</button>
        <button type="button" class="btn teal" id="savePdf">${icon("file")} Save & PDF</button>
      </div>
    </form>`);
    v.querySelectorAll("textarea").forEach(autoGrow);
  };

  const read = () => {
    const f = v.querySelector("#f"), val = (n) => f.elements[n].value.trim();
    for (const k of ["name", "category", "prepTime", "cookTime", "tips", "link"]) r[k] = val(k);
    r.servings = val("servings") ? +val("servings") : "";
    r.ingredients = val("ingredients").split("\n").map((x) => x.trim()).filter(Boolean);
    r.steps = val("steps").split("\n").map((x) => x.trim()).filter(Boolean);
    v.querySelectorAll("[data-nut]").forEach((i) => { if (i.value === "") delete r.nutrition[i.dataset.nut]; else r.nutrition[i.dataset.nut] = +i.value; });
  };
  v.addEventListener("input", mark);
  v.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") e.preventDefault(); });
  v.addEventListener("change", async (e) => {
    if (e.target.id === "photo" && e.target.files[0]) {
      read();
      try { r.photo = await shrinkPhoto(e.target.files[0]); mark(); render(); } catch { toast("That image couldn't be read"); }
    }
  });
  v.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const g = b.closest("[data-seg]"); if (g) { g.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); r[g.dataset.seg] = b.dataset.v; mark(); return; }
    if (b.id === "noPhoto") { read(); r.photo = null; mark(); return render(); }
    if (b.id === "del") {
      if (!(await confirmBox("Delete recipe?", `“${r.name}” will be removed from the recipe list and from any plan it was added to.`))) return;
      await store.deleteRecipe(r.id); dirty = false; toast("Recipe deleted"); return ctx.goReplace("#/recipes");
    }
    if (b.id === "save" || b.id === "savePdf") {
      read();
      if (!r.name) { toast("Please enter the recipe name"); v.querySelector("[name=name]").focus(); return; }
      if (r.link && !/^https?:\/\//i.test(r.link)) r.link = "https://" + r.link;
      const dup = store.data.recipes.find((x) => x.id !== r.id && normText(x.name) === normText(r.name));
      if (dup && !(await confirmBox("Recipe name already used", `“${dup.name}” already exists. Save another recipe with the same name?`, "Save anyway", false))) return;
      const saved = await store.upsertRecipe(r);
      Object.assign(r, saved); dirty = false; store._editorDirty = false;
      toast("Recipe saved");
      if (!existing) { existing = saved; ctx.replace(`#/recipe/${saved.id}`); ctx.title("Edit recipe"); render(); }   // now shows Delete too
      if (b.id === "savePdf") openRecipeExport([saved]);
    }
  });
  render();
}
