// Add / edit client, with live BMI.
import { store, todayIso, normText } from "../store.js";
import { html, icon, toast, confirmBox, autoGrow } from "../ui.js";
import { clientMetrics } from "../model.js";
import { removeReminder } from "../reminders.js";

// Fields this form edits; everything else on the client (logs, notes, code) is left as stored.
// "+91 98765 43210", "09876543210" → "9876543210" (last 10 digits)
const ccOf = (c) => String(c.phoneCode || store.settingsRO.defaultCountryCode || "91").replace(/\D/g, "");
const phoneDigits = (c) => { const d = String(c.phone || "").replace(/\D/g, ""), cc = ccOf(c); return d.length > 10 && d.startsWith(cc) ? d.slice(cc.length) : d.slice(-12); };
const FORM_KEYS = ["name", "code", "phone", "phoneCode", "email", "age", "sex", "heightFt", "heightIn", "bloodGroup", "foodPreference", "foodNotes", "likes", "dislikes",
  "allergies", "medical", "healthFlags", "healthLevels", "water", "mealPattern"];

export default function clientForm(ctx, id) {
  const s = store.settings;
  const existing = id ? store.client(id) : null;
  if (id && !existing) { toast("That client was deleted"); ctx.goReplace("#/clients"); return; }
  const c = existing ? structuredClone(existing) : { name: "", phone: "", age: "", sex: "Female", heightFt: 5, heightIn: 0, bloodGroup: "",
    foodPreference: s.foodPreferences[0].label, likes: "", dislikes: "", allergies: "", medical: "", healthFlags: [], healthLevels: {}, foodNotes: "",
    water: s.defaults.water, mealPattern: "", weightLog: [], measurementLog: [] };
  const m = clientMetrics(c);
  ctx.title(existing ? `Edit client · ${existing.code || ""}` : "New client");
  ctx.back(existing ? `#/client/${id}` : "#/clients");
  let dirty = false;
  store._editorDirty = false;
  ctx.guard(async () => !dirty || confirmBox("Discard changes?", "You have unsaved changes.", "Discard"));

  const seg = (name, opts, cur) => html`<div class="seg" data-seg="${name}">${opts.map(([v, l]) => html`<button type="button" data-v="${v}" class="${String(cur) === String(v) ? "on" : ""}">${l}</button>`)}</div>`;
  const v = ctx.view();
  v.innerHTML = String(html`
  <form id="f" autocomplete="off">
    <div class="card"><h2>Basic details</h2>
      <div class="form-grid">
        <label class="field half"><span>Full name *</span><input type="text" name="name" value="${c.name}" required></label>
        <label class="field half"><span>Client ID *</span><input type="text" name="code" value="${c.code || store.nextClientCode()}" maxlength="20" autocapitalize="characters"></label>
        <label class="field full"><span>WhatsApp number</span><div class="phone-in"><span>+</span><input type="tel" name="phoneCode" class="cc" value="${ccOf(c)}" inputmode="numeric" aria-label="Country code"><input type="tel" name="phone" value="${phoneDigits(c)}" placeholder="Mobile number" inputmode="numeric"></div></label>
        <label class="field full"><span>Email (Gmail or any)</span><input type="email" name="email" value="${c.email || ""}" placeholder="name@gmail.com" inputmode="email" autocapitalize="off" spellcheck="false"></label>
        <label class="field"><span>Age</span><input type="number" name="age" value="${c.age}" min="1" max="120" inputmode="numeric"></label>
        <label class="field"><span>Blood group</span><select name="bloodGroup"><option value="">–</option>${s.bloodGroups.map((b) => html`<option ${b === c.bloodGroup ? "selected" : ""}>${b}</option>`)}</select></label>
        <div class="full"><span class="field-label">Sex</span>${seg("sex", [["Female", "Female"], ["Male", "Male"], ["Other", "Other"]], c.sex)}</div>
      </div></div>

    <div class="card"><h2>Height, weight & BMI</h2>
      <div class="form-grid">
        <label class="field"><span>Height (feet)</span><input type="text" name="heightFt" value="${c.heightFt}" inputmode="decimal" placeholder="5"></label>
        <label class="field"><span>Height (inches)</span><input type="number" name="heightIn" value="${c.heightIn}" min="0" max="11.5" step="0.5" inputmode="decimal"></label>
        <label class="field half"><span>${existing ? "Weight today (kg) – optional" : "Starting weight (kg)"}</span>
          <input type="number" name="weightNow" step="0.1" min="20" max="300" inputmode="decimal" placeholder="${m.cur ? `Last: ${m.cur.kg} kg` : "e.g. 72.5"}"></label>
        <div class="full"><div class="bmi-live" id="bmi"></div></div>
      </div></div>

    <div class="card"><h2>Health</h2>
      <div class="stack">
        <label class="field"><span>Medical problems</span><textarea name="medical" rows="2">${c.medical}</textarea></label>
        <div><span class="field-label">${s.healthIssuesTitle}</span>
          <div class="stack" id="flags" style="margin-top:6px">${s.healthFlags.map((f) => { const on = c.healthFlags.includes(f), lv = (c.healthLevels || {})[f] || "";
            return html`<div class="row wrap between" style="gap:8px"><span style="min-width:110px;font-weight:500">${f}</span>
              <div class="seg" data-flag="${f}"><button type="button" data-v="" class="${on ? "" : "on"}">No</button>
                ${s.severityLevels.map((l) => html`<button type="button" data-v="${l.key}" class="${on && lv === l.key ? "on" : ""}">${l.label}</button>`)}
                ${on && !lv ? html`<button type="button" data-v="yes" class="on">Yes</button>` : ""}</div></div>`; })}</div></div>
        <label class="field"><span>Food allergies</span><textarea name="allergies" rows="1">${c.allergies}</textarea></label>
      </div></div>

    <div class="card"><h2>Food</h2>
      <div class="stack">
        <div><span class="field-label">Food preference</span>${seg("foodPreference", s.foodPreferences.map((p) => [p.label, p.label]), c.foodPreference)}</div>
        <label class="field"><span>Food preference notes</span><textarea name="foodNotes" rows="1" placeholder="e.g. No chicken on Wednesday">${c.foodNotes || ""}</textarea></label>
        <label class="field"><span>Likes</span><textarea name="likes" rows="1">${c.likes}</textarea></label>
        <label class="field"><span>Dislikes</span><textarea name="dislikes" rows="1">${c.dislikes}</textarea></label>
        <label class="field"><span>Water intake</span><textarea name="water" rows="1">${c.water}</textarea></label>
        <div><span class="field-label">Meal plan type</span>
          ${seg("mealPattern", [["", "Ask on first plan"], ...Object.entries(s.mealPatterns).map(([k, p]) => [k, p.label])], c.mealPattern || "")}</div>
      </div></div>

    <div class="action-bar">
      ${existing ? html`<button type="button" class="btn ghost" id="del" style="flex:none">${icon("trash")}</button>` : ""}
      <button class="btn teal" type="submit">${icon("check")} Save client</button>
    </div>
  </form>`);

  const f = v.querySelector("#f");
  const val = (n) => f.elements[n].value;
  // Height in the feet box: 5 · 5.4 · 5,4 · 5'4 · 5' 4" · 5-4 · 5 4 all mean 5 ft (4 in). Returns null if it can't be read.
  const readHeight = () => {
    const raw = val("heightFt").trim(), inch = parseFloat(val("heightIn")) || 0;
    if (!raw) return { ft: 0, inch };
    const m = /^(\d)\s*(?:['’.,\-\s]|ft)\s*(\d{0,2})\s*(?:"|”|''|in)?$/i.exec(raw) || /^(\d)$/.exec(raw);
    if (!m) return null;
    const ft = +m[1], i2 = m[2] ? +m[2] : null;
    if (ft < 3 || ft > 7 || (i2 != null && i2 > 11)) return null;
    return { ft, inch: i2 != null ? i2 : inch, split: i2 != null };
  };
  const drawBmi = () => {
    const w = parseFloat(val("weightNow")) || m.cur?.kg, h = readHeight();
    const bmi = h ? DietRender.computeBmi(w, h.ft, h.inch) : null;
    const el = v.querySelector("#bmi");
    if (!bmi) { el.className = "bmi-live empty-bmi"; el.innerHTML = h ? "Enter height and weight to see BMI" : "Height not clear: type feet, e.g. 5 or 5.4 (= 5 ft 4 in)"; return; }
    const band = DietRender.bmiBand(bmi, s);
    el.className = "bmi-live"; el.style.background = band.color;
    const hm = ((h.ft * 12 + h.inch) * 0.0254);
    el.innerHTML = String(html`<div><div class="v">${bmi}</div></div><div><b>${band.label}</b>
      <div class="s">${h.ft} ft ${h.inch} in · ${w} kg ÷ (${hm.toFixed(2)} m)² = ${bmi} kg/m²</div></div>`);
  };
  f.elements.heightFt.addEventListener("change", (e) => {
    const h = readHeight();
    if (!h) { toast("Height not clear: type feet, e.g. 5 or 5.4 (= 5 ft 4 in)", 3500); return; }
    if (h.split) { e.target.value = h.ft; f.elements.heightIn.value = h.inch; toast(`Read as ${h.ft} ft ${h.inch} in`); }
    drawBmi();
  });
  // digits only, max 10; a pasted/typed "+91" or leading 0 is dropped because +91 is already shown
  f.elements.phone.addEventListener("input", (e) => {
    let d = e.target.value.replace(/\D/g, "");
    const cc = f.elements.phoneCode.value.replace(/\D/g, "") || "91", max = cc === "91" ? 10 : 12;
    if (d.length > max && d.startsWith(cc)) d = d.slice(cc.length);   // typed/pasted with the country code
    if (d.length > max && d.startsWith("0")) d = d.slice(1);
    d = d.slice(0, max);
    if (d !== e.target.value) e.target.value = d;
  });
  f.elements.phoneCode.addEventListener("input", (e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 4); if (d !== e.target.value) e.target.value = d; });
  f.addEventListener("input", (e) => { dirty = true; store._editorDirty = true; if (["weightNow", "heightFt", "heightIn"].includes(e.target.name)) drawBmi(); });
  v.querySelectorAll("[data-seg]").forEach((g) => g.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    g.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); c[g.dataset.seg] = b.dataset.v; dirty = true; store._editorDirty = true;
  }));
  // Health issues: No / Mild / Moderate / Severe for each
  v.querySelector("#flags").addEventListener("click", (e) => {
    const b = e.target.closest("button"); const g = b?.closest("[data-flag]"); if (!g) return;
    g.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    const f = g.dataset.flag, lv = b.dataset.v; dirty = true; store._editorDirty = true;
    c.healthLevels = { ...(c.healthLevels || {}) };
    c.healthFlags = c.healthFlags.filter((x) => x !== f);
    if (lv) { c.healthFlags.push(f); if (lv !== "yes") c.healthLevels[f] = lv; } else delete c.healthLevels[f];
  });
  v.querySelector("#del")?.addEventListener("click", async () => {
    if (!(await confirmBox("Delete client?", `This deletes ${c.name}, all their plans and appointments. This cannot be undone.`))) return;
    // remove this client's calendar reminders too (queued if Google isn't connected right now)
    const ids = [...store.plansFor(c.id).map((p) => p.reminderEventId), ...store.data.appointments.filter((x) => x.clientId === c.id).map((x) => x.eventId)].filter(Boolean);
    for (const id of ids) { try { await removeReminder(id); } catch {} }
    await store.deleteClient(c.id); dirty = false; toast("Client deleted"); ctx.goReplace("#/clients");
  });
  // Enter adds a new line in text boxes and does nothing in single-line fields; only "Save client" saves.
  f.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") e.preventDefault(); });
  f.querySelectorAll("textarea").forEach(autoGrow);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    for (const k of ["name", "code", "phone", "phoneCode", "email", "bloodGroup", "medical", "allergies", "likes", "dislikes", "water", "foodNotes"]) c[k] = val(k).trim();
    c.age = val("age") ? +val("age") : ""; { const h = readHeight(); if (!h) { toast("Height not clear: type feet, e.g. 5 or 5.4 (= 5 ft 4 in)", 3500); f.elements.heightFt.focus(); return; }
      if (h.inch < 0 || h.inch > 11.5) { toast("Inches must be 0 to 11.5"); f.elements.heightIn.focus(); return; }
      c.heightFt = h.ft; c.heightIn = h.inch; }
    if (!c.name) { toast("Please enter the client's name"); return; }
    // Same name as someone else? Ask first (Client IDs keep them apart).
    c.code = c.code.toUpperCase();
    if (!c.code) { toast("Please enter a Client ID"); f.elements.code.focus(); return; }
    const taken = store.data.clients.find((x) => x.id !== c.id && normText(x.code) === normText(c.code));
    if (taken) { toast(`Client ID ${c.code} is already used by ${taken.name}`, 4000); f.elements.code.focus(); return; }
    c.phoneCode = c.phoneCode.replace(/\D/g, "") || "91";
    if (c.phoneCode.length > 4) { toast("Country code can have at most 4 digits"); f.elements.phoneCode.focus(); return; }
    c.email = c.email.replace(/\s+/g, "").toLowerCase();
    if (c.email && !/^[^@]+@[^@]+\.[a-z]{2,}$/i.test(c.email)) { toast("Please check the email address (e.g. name@gmail.com)"); f.elements.email.focus(); return; }
    if (c.phone && c.phoneCode === "91" && !/^\d{10}$/.test(c.phone)) { toast("WhatsApp number must be exactly 10 digits"); f.elements.phone.focus(); return; }
    if (c.phone && c.phoneCode !== "91" && !/^\d{6,12}$/.test(c.phone)) { toast("WhatsApp number must be 6–12 digits"); f.elements.phone.focus(); return; }
    const same = store.data.clients.filter((x) => x.id !== c.id && normText(x.name) === normText(c.name));
    if (same.length && !(await confirmBox("Client with this name already exists",
      `${same.map((x) => `${x.name} (${x.code})`).join(", ")} is already saved. Create ${existing ? "this" : "a new"} client with the same name anyway? They will have a different Client ID.`, existing ? "Save anyway" : "Create new client", false))) return;
    // Save onto the newest copy so weights/notes/measurements added meanwhile (e.g. synced from the phone) are kept.
    const target = existing ? { ...(store.client(c.id) || {}), ...Object.fromEntries(FORM_KEYS.map((k) => [k, c[k]])) } : c;
    const w = parseFloat(val("weightNow"));
    if (w) { const t = todayIso(); target.weightLog = (target.weightLog || []).filter((x) => x.date !== t).concat({ date: t, kg: w }); }
    const saved = await store.upsertClient(target);
    dirty = false; store._editorDirty = false;
    toast("Client saved"); ctx.goReplace(`#/client/${saved.id}`);
  });
  drawBmi();
  if (!existing) f.elements.name.focus();
}
