// Settings: Google account & sync, branding, meal patterns, client fields, measurements, defaults, data.
import { store, local, uid, todayIso, cleanDb } from "../store.js";
import { html, icon, toast, confirmBox, modal, to12, to24, addDaysIso, SLOT_ICONS, SLOT_COLORS } from "../ui.js";
import * as G from "../google.js";
import * as sync from "../sync.js";
import { downloadBlob } from "../export.js";
import { canInstall, installApp, connectOrSync, isIOS, isStandalone, applyTheme, themePref } from "../app.js";
import { DEFAULT_SETTINGS, PDF_SECTIONS } from "../defaults.js";

const trashLabel = (t) => t.kind === "client" ? `${t.item.name}${t.item.code ? ` (${t.item.code})` : ""}${t.plans?.length ? ` + ${t.plans.length} plan${t.plans.length > 1 ? "s" : ""}` : ""}`
  : t.kind === "plan" ? `${store.client(t.item.clientId)?.name || "Deleted client"} – ${t.item.days === 7 && t.item.weekNumber ? `Week ${t.item.weekNumber}` : `${t.item.days}-day plan`} from ${t.item.startDate}`
  : t.kind === "recipe" ? t.item.name : t.kind === "meal" ? t.item.text
  : t.kind === "note" ? `Note for ${t.clientName || "client"}: ${String(t.item.text || "").slice(0, 50)}`
  : t.kind === "payment" ? `Payment ${DietRender.inr(t.item.amount)} – ${t.clientName || "client"} (${t.item.date}${t.item.receiptNo ? ", " + t.item.receiptNo : ""})`
  : t.kind === "package" ? `Package “${t.item.name}” ${DietRender.inr(t.item.fee)} – ${t.clientName || "client"}`
  : t.kind === "template" ? `Template “${t.item.name}”`
  : t.kind === "appointment" ? `Appointment ${t.item.date} ${t.item.time || ""}` : t.kind;

export default function settingsView(ctx) {
  ctx.title("Settings");
  let st = store.settings;
  let openType = null;   // keeps the plan type you're editing open after each change
  const save = async (msg) => { await store.setSettings(st); store._editorDirty = false; if (msg) toast(msg); };
  const v = ctx.view();
  // Settings save when you leave a field. Typing that isn't saved yet is protected against reload / closing the app.
  store._editorDirty = false; ctx.guard(async () => true); ctx.onCleanup(() => { store._editorDirty = false; });
  v.addEventListener("input", (e) => { if (!e.target.matches('input[type="file"], input[type="search"]')) store._editorDirty = true; });

  function render() {
    const ss = sync.syncState();
    const statusText = { off: "Not connected", "needs-auth": "Connected earlier – tap Connect to resume", syncing: "Syncing…", ok: `Synced ${ss.last ? ss.last.toLocaleTimeString() : ""}`, error: `Problem: ${ss.error}` }[ss.status];
    const rowsList = (key, list, cols) => html`${list.map((x, i) => html`<div class="row-item" style="grid-template-columns:${cols.map((c) => c.w).join(" ")} 40px">
        ${cols.map((c) => html`<input type="text" data-list="${key}" data-i="${i}" data-f="${c.f}" value="${x[c.f] ?? ""}" placeholder="${c.ph}">`)}
        <button class="icon-btn danger" data-rm="${key}" data-i="${i}" aria-label="Remove">${icon("trash")}</button></div>`)}
      <button class="btn small ghost" data-addrow="${key}">${icon("plus")} Add</button>`;

    v.innerHTML = String(html`
    ${canInstall() ? html`<div class="card row" style="background:var(--teal-soft)"><div class="grow"><b>Install the app</b><div class="small muted">Adds an icon to your home screen / Start menu.</div></div>
      <button class="btn teal small" id="install">${icon("install")} Install</button></div>` : ""}

    <div class="card"><h2>${icon("cloud")} Google Drive</h2>
      ${(() => { const acc = G.account(), on = G.hasToken(), was = G.wasConnected();
        if (!G.isConfigured()) return html`<p class="small muted">Google isn't set up yet. Open <b>Setup (advanced)</b> below and add the Client ID (see README).</p>`;
        if (!was && !on) return html`<p class="small muted">Not connected. Your data is saved on this device only. Connect to keep it in your own Google Drive (folder “${window.APP_CONFIG.driveFolderName}”) and in sync between phone and laptop.</p>
          <button class="btn teal" id="connect">${icon("cloud")} Connect Google</button>`;
        return html`<div class="acct">
            <div class="avatar" style="width:42px;height:42px;font-size:16px;background:${on ? "var(--teal)" : "#9AA5B1"}">${(acc?.email || "G")[0].toUpperCase()}</div>
            <div class="grow"><div><b>${on ? "Connected to Google Drive" : "Paused – tap Reconnect"}</b></div>
              <div class="small">${acc?.email || "Google account"}</div>
              <div class="tiny muted">${ss.status === "ok" ? `Last synced ${ss.last ? ss.last.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}` : ss.status === "syncing" ? "Syncing…" : ss.status === "error" ? `Problem: ${ss.error}` : on ? "Ready" : "Sign-in expired (Google allows about 1 hour). One tap continues."}</div></div></div>
          ${on && !G.calendarGranted() ? html`<p class="small" style="color:var(--warn);margin:8px 0 0">Calendar permission was not given – reminders are off. Disconnect and connect again to allow it.</p>` : ""}
          <div class="row wrap" style="margin-top:10px">
            <button class="btn teal" id="connect">${icon("cloud")} ${on ? "Sync now" : "Reconnect"}</button>
            <button class="btn ghost" id="switchAcc">Switch account</button>
            <button class="btn ghost" id="disconnect">Disconnect</button></div>`; })()}
      ${isIOS() && isStandalone() ? html`<p class="tiny muted" style="margin:8px 0 0">On iPhone, if “Connect Google” doesn’t finish inside the home-screen app, use the app in Safari instead (bookmark the link). The home-screen app and Safari keep separate copies, so connect Google in the one you use — your data comes from Drive.</p>` : ""}
      <label class="inline-check" style="margin-top:10px"><input type="checkbox" data-bool="sync.saveExportsToDrive" ${st.sync.saveExportsToDrive ? "checked" : ""}> Save a copy of every exported PDF / PNG to Drive</label>
      <details class="more" style="margin-top:10px"><summary class="small muted">Setup (advanced)</summary>
        <label class="field" style="margin-top:8px"><span>Google OAuth Client ID (one-time setup – see README)</span>
          <input type="text" id="cid" value="${G.clientId()}" placeholder="xxxxx.apps.googleusercontent.com" ${window.APP_CONFIG.googleClientId ? "readonly" : ""}></label>
        ${window.APP_CONFIG.googleClientId ? html`<p class="tiny muted" style="margin:4px 0 0">Set in js/config.js for every device – nothing to do here.</p>` : ""}
        <p class="small" style="margin:10px 0 4px"><b>Installed app sign-in</b> – in the installed app, Google sign-in opens in this window (no pop-up). One-time step: in Google Cloud → Clients → your client, add this under <b>Authorized redirect URIs</b>:</p>
        <div class="row" style="gap:6px"><input type="text" readonly value="${G.redirectUri()}" id="ruri" data-nodirty><button type="button" class="btn small ghost" id="copyUri">Copy</button></div>
      </details></div>

    ${G.wasConnected() || G.hasToken() ? html`<div class="card"><h2>${icon("download")} Backups in Drive</h2>
      <p class="small muted">Once a week the app asks whether to save a backup copy in Drive (folder “Backups”, last 8 kept). ${store.data.backup?.lastAt ? html`Last backup: <b>${new Date(store.data.backup.lastAt).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}</b>.` : "No backup yet."}</p>
      <div class="row wrap"><button class="btn ghost" id="backupNow">${icon("cloud")} Back up now</button><button class="btn ghost" id="showBackups">Restore from a Drive backup…</button></div></div>` : ""}

    <div class="card"><h2>${icon("trash")} Recycle bin</h2>
      ${(store.data.trash || []).length ? html`<p class="small muted">Deleted items are kept for 30 days, then removed for good.</p>
        <div class="list">${store.data.trash.map((t) => html`<div class="row-item" style="grid-template-columns:1fr auto">
          <div><b>${trashLabel(t)}</b><div class="tiny muted">${t.kind[0].toUpperCase() + t.kind.slice(1)} · deleted ${new Date(t.deletedAt).toLocaleDateString([], { day: "numeric", month: "short" })} · ${Math.max(0, 30 - Math.floor((Date.now() - Date.parse(t.deletedAt)) / 86400000))} days left</div></div>
          <div class="row"><button class="btn small" data-untrash="${t.id}">Restore</button><button class="icon-btn danger" data-killtrash="${t.id}" aria-label="Delete forever">${icon("trash")}</button></div></div>`)}</div>
        <button class="btn small ghost" id="emptyTrash" style="margin-top:8px">Empty recycle bin</button>` : html`<p class="small muted">Empty. Deleted clients, plans, recipes, meals, notes and appointments wait here for 30 days so you can restore them.</p>`}</div>

    <div class="card"><h2>Appearance</h2>
      <p class="small muted">Saved on this device. “Automatic” follows the phone / computer setting. The moon/sun button at the top switches quickly.</p>
      <div class="seg" id="themeSeg">${[["light", "Light"], ["dark", "Dark"], ["auto", "Automatic"]].map(([k, l]) => html`<button data-theme="${k}" class="${themePref() === k ? "on" : ""}">${l}</button>`)}</div></div>

    <div class="card"><h2>Branding</h2>
      <div class="form-grid">
        <label class="field half"><span>Business name</span><input type="text" data-path="branding.name" value="${st.branding.name}"></label>
        <label class="field half"><span>Tagline</span><input type="text" data-path="branding.tagline" value="${st.branding.tagline}"></label>
        <div class="full row wrap"><img src="${st.branding.logoDataUrl || window.__ASSETS?.["assets/logo.png"] || "assets/logo.png"}" alt="Logo" style="height:64px;background:#fff;border-radius:10px;border:1px solid var(--line);padding:4px">
          <label class="btn small ghost">${icon("image")} Change logo<input type="file" id="logo" accept="image/png,image/jpeg" hidden></label>
          ${st.branding.logoDataUrl ? html`<button class="btn small ghost" id="logoReset">Use default</button>` : ""}</div>
        <label class="field half"><span>Watermark strength: <b id="wmv">${Math.round(st.branding.watermarkOpacity * 100)}%</b></span>
          <input type="range" min="0" max="25" value="${Math.round(st.branding.watermarkOpacity * 100)}" id="wm"></label>
        <div class="half"><span class="field-label">Paper size</span><div class="seg" data-segpath="page.size">${["A4", "LETTER"].map((p) => html`<button data-v="${p}" class="${st.page.size === p ? "on" : ""}">${p === "A4" ? "A4" : "Letter"}</button>`)}</div></div>
        <label class="inline-check full"><input type="checkbox" data-bool="branding.coverLogo" ${st.branding.coverLogo ? "checked" : ""}> Show logo on the PDF cover</label>
      </div></div>

    <div class="card"><h2>Payments & receipts</h2>
      <div class="form-grid">
        <label class="field full"><span>Payment modes (comma separated)</span><input type="text" id="payModes" value="${(st.paymentModes || []).join(", ")}"></label>
        <label class="field full"><span>Your details on receipts (address, phone, GSTIN… one per line, optional)</span><textarea data-path="receipt.details" rows="3" placeholder="Clinic address&#10;Phone">${st.receipt?.details || ""}</textarea></label>
        <label class="field half"><span>UPI ID (for invoices, optional)</span><input type="text" data-path="receipt.upiId" value="${st.receipt?.upiId || ""}" placeholder="name@okhdfcbank" autocapitalize="off" spellcheck="false"></label>
        <label class="field half"><span>Name on UPI (optional)</span><input type="text" data-path="receipt.upiName" value="${st.receipt?.upiName || ""}" placeholder="${st.branding.name}"></label>
        <label class="field full"><span>Bank details for invoices (optional, one per line)</span><textarea data-path="receipt.bank" rows="3" placeholder="A/c name&#10;A/c no.&#10;IFSC">${st.receipt?.bank || ""}</textarea></label>
        <label class="field full"><span>Line at the bottom of receipts and invoices (optional)</span><input type="text" data-path="receipt.note" value="${st.receipt?.note || ""}"></label>
      </div></div>

    <div class="card"><div class="card-head"><h2>Meal plan types</h2><button class="btn small teal" id="newType">${icon("plus")} Create new plan type</button></div>
      <p class="small muted">Tap a type to edit its sections. “Daily” = different each day, “Same” = one row for all days. Section names, icons and colours are shared by all types.</p>
      <p class="small muted"><b>Default timings:</b> the time next to each section is the default used for a <b>new client's first plan</b>. After that, each client keeps their own timings (changing a time in their plan updates them).</p>
      ${Object.entries(st.mealPatterns).map(([pk, p]) => { const builtIn = pk in DEFAULT_SETTINGS.mealPatterns; const used = store.data.plans.filter((x) => x.pattern === pk).length;
        return html`<details class="ptype" data-pk="${pk}" ${openType === pk ? "open" : ""}>
        <summary><span class="grow"><b>${p.label}</b> <span class="small muted">· ${p.slots.length} sections · ${used} plan${used === 1 ? "" : "s"}</span></span>${builtIn ? html`<span class="badge">Built-in</span>` : ""}</summary>
        <div class="stack" style="margin-top:12px">
          <label class="field"><span>Name</span><input type="text" data-plabel="${pk}" value="${p.label}"></label>
          ${p.slots.map((x, i) => { const sc = st.slotCatalog[x.id] || { name: x.id, icon: "star", accent: "#7A8594", fill: "#F4F7FA" }; return html`
          <div class="slot-edit" style="--accent:${sc.accent};--fill:${sc.fill}">
            <button type="button" class="slot-ico" data-editslot="${x.id}" title="Change icon & colour">${icon(sc.icon)}</button>
            <input type="text" data-slotname="${x.id}" value="${sc.name}" aria-label="Section name">
            <input type="time" data-pt="${pk}" data-i="${i}" value="${to24(x.time)}" aria-label="Time">
            <div class="seg" data-pm="${pk}" data-i="${i}"><button data-v="daily" class="${x.mode === "daily" ? "on" : ""}">Daily</button><button data-v="shared" class="${x.mode === "shared" ? "on" : ""}">Same</button></div>
            <span class="row" style="gap:2px">
              <button type="button" class="icon-btn" data-mv="-1" data-pk="${pk}" data-i="${i}" aria-label="Move up" ${i ? "" : "disabled"}>▲</button>
              <button type="button" class="icon-btn" data-mv="1" data-pk="${pk}" data-i="${i}" aria-label="Move down" ${i < p.slots.length - 1 ? "" : "disabled"}>▼</button>
              <button type="button" class="icon-btn danger" data-rmslot="${pk}" data-i="${i}" aria-label="Remove section">${icon("x")}</button></span>
          </div>`; })}
          <div class="row wrap">
            <select data-addslot="${pk}" style="max-width:280px"><option value="">+ Add a section…</option>
              ${Object.entries(st.slotCatalog).filter(([id]) => !p.slots.some((x) => x.id === id)).map(([id, sc]) => html`<option value="${id}">${sc.name}</option>`)}
              <option value="__new">New section…</option></select>
            ${builtIn ? "" : html`<button type="button" class="btn small ghost" data-delpt="${pk}" style="color:var(--coral)">${icon("trash")} Delete this type</button>`}
          </div>
        </div></details>`; })}
      <label class="field" style="margin-top:14px"><span>Use landscape meal table from how many days?</span><input type="number" min="1" max="8" data-num="page.landscapeFromDays" value="${st.page.landscapeFromDays}" style="width:120px"></label>
    </div>

    <div class="card"><h2>Client details</h2>
      <label class="field"><span>Client ID prefix (new IDs look like ${st.clientIdPrefix || "C"}-0001)</span><input type="text" data-path="clientIdPrefix" value="${st.clientIdPrefix || "C"}" maxlength="6"></label>
      <label class="field"><span>Default WhatsApp country code (without +)</span><input type="tel" data-path="defaultCountryCode" value="${st.defaultCountryCode || "91"}" maxlength="4" inputmode="numeric"></label>
      <label class="field"><span>Heading for health issues (form, client page and PDF)</span><input type="text" data-path="healthIssuesTitle" value="${st.healthIssuesTitle}"></label>
      <span class="field-label" style="margin-top:12px">Issues (each gets No / ${st.severityLevels.map((l) => l.label).join(" / ")})</span>
      <div class="chips" style="margin-bottom:8px">${st.healthFlags.map((f, i) => html`<button type="button" class="chip on coral" data-rmflag="${i}" aria-label="Remove ${f}">${f} ✕</button>`)}</div>
      <div class="row"><input type="text" id="newFlag" placeholder="Add e.g. Thyroid" class="grow"><button class="btn small ghost" id="addFlag">${icon("plus")} Add</button></div>
      <span class="field-label" style="margin-top:16px">Level names</span>
      <div class="form-grid">${st.severityLevels.map((l, i) => html`<label class="field"><span>Level ${i + 1}</span><input type="text" data-list="severityLevels" data-i="${i}" data-f="label" value="${l.label}"></label>`)}</div>
      <span class="field-label" style="margin-top:16px">BMI ranges</span>
      <div class="form-grid">${st.bmiBands.slice(0, 3).map((b, i) => html`<label class="field"><span>${b.label} below</span><input type="number" step="0.1" data-bmi="${i}" value="${b.max}"></label>`)}
        <div class="field"><span class="field-label">Quick set</span><div class="seg" id="bmiPreset"><button data-v="who">Standard</button><button data-v="asian">Asian-Indian</button></div></div></div>
    </div>

    <div class="card"><h2>Body measurements</h2>
      <div class="seg" data-segpath="measurements.unit" style="margin-bottom:12px">${[["in", "Inches"], ["cm", "cm"]].map(([k, l]) => html`<button data-v="${k}" class="${st.measurements.unit === k ? "on" : ""}">${l}</button>`)}</div>
      <div class="rows">${rowsList("measurements.sites", st.measurements.sites, [{ f: "label", ph: "Name", w: "1fr" }, { f: "hint", ph: "Where (optional)", w: "1fr" }])}</div>
    </div>

    <div class="card"><h2>Defaults for new plans</h2>
      <span class="field-label">Exercise</span>
      <div class="rows">${rowsList("defaults.exercise", st.defaults.exercise, [{ f: "text", ph: "Exercise", w: "1fr" }, { f: "duration", ph: "20 mins", w: "110px" }])}</div>
      <span class="field-label" style="margin-top:14px">Serving guide</span>
      <div class="rows">${rowsList("defaults.servingSizes", st.defaults.servingSizes, [{ f: "value", ph: "5 g", w: "110px" }, { f: "label", ph: "1 Teaspoon", w: "1fr" }])}</div>
      <div class="grid two" style="margin-top:14px">${st.defaults.guidelines.map((g, i) => html`<label class="field"><span>${g.title} (one per line)</span><textarea rows="6" data-gl="${i}">${g.items.join("\n")}</textarea></label>`)}</div>
      <label class="field" style="margin-top:14px"><span>Allowed food – default for new plans (one per line, e.g. vegetables and fruits)</span><textarea rows="6" id="defAllowed" placeholder="Lauki, Tinda, Palak&#10;Apple, Papaya, Guava">${(st.defaults.allowedFood || []).join("\n")}</textarea></label>
      <label class="field" style="margin-top:12px"><span>Default water intake</span><input type="text" data-path="defaults.water" value="${st.defaults.water}"></label>
    </div>

    <div class="card"><h2>Include in PDF (default for new plans)</h2>
      <p class="small muted">Each plan can still switch sections on or off.</p>
      <div class="grid two">${PDF_SECTIONS.map(([k, label]) => html`<label class="inline-check"><input type="checkbox" data-bool="pdfSections.${k}" ${st.pdfSections[k] ? "checked" : ""}> <span>${label}</span></label>`)}</div></div>

    <div class="card"><h2>PDF & reminders</h2>
      <div class="stack">
        <label class="inline-check"><input type="checkbox" data-bool="output.showLinks" ${st.output.showLinks ? "checked" : ""}> Show recipe / video links in the PDF</label>
        <div class="form-grid">
          <label class="field half"><span>Plan-ending reminder: days before</span><input type="number" min="0" max="7" data-num="reminders.planEndDaysBefore" value="${st.reminders.planEndDaysBefore}"></label>
          <label class="field half"><span>Reminder time</span><input type="time" data-path="reminders.planEndTime" value="${st.reminders.planEndTime}"></label>
          <label class="field half"><span>Weight chart: last N weigh-ins</span><input type="number" min="3" max="60" data-num="output.chartMaxPoints" value="${st.output.chartMaxPoints}"></label>
        </div></div></div>

    <div class="card"><h2>Data</h2>
      <p class="small muted">${store.data.clients.length} clients · ${store.data.plans.length} plans · ${store.data.library.length} meals · ${store.data.appointments.length} appointments</p>
      <div class="row wrap">
        <button class="btn ghost" id="backup">${icon("download")} Download backup</button>
        <label class="btn ghost">${icon("install")} Restore backup<input type="file" id="restore" accept="application/json,.json" hidden></label>
        <button class="btn ghost" id="demo">Add demo client</button>
        <button class="btn ghost" id="resetSettings">Reset settings</button>
      </div></div>
    <p class="tiny muted" style="text-align:center">NutriWise Diet Planner v${window.APP_CONFIG.appVersion}</p>`);
  }

  async function pickBackup() {
    let files;
    try { files = await sync.listBackups(); } catch (e) { return toast(e.code === "auth" ? "Reconnect Google first" : "Couldn't read Drive: " + e.message, 4000); }
    if (!files.length) return toast("No backups in Drive yet – tap “Back up now” to make one.", 3500);
    const fmt = (f) => { const m = /(\d{4}-\d{2}-\d{2})(?:-(\d{2})(\d{2}))?/.exec(f.name); const d = m ? new Date(m[1] + "T00:00") : new Date(f.createdTime);
      return `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" })}${m?.[2] ? ` ${m[2]}:${m[3]}` : ""}`; };
    const id = await modal(String(html`<h2>Restore from Drive</h2><p class="small muted">Everything on this device (and, after the next sync, in Drive) is replaced by the copy you choose. A safety copy of the current data is saved first, so you can undo this.</p>
      <div class="stack" style="margin-top:10px">${files.map((f) => html`<button class="choice" data-close="${f.id}"><span><b>${fmt(f)}</b><span class="small muted">${f.name.includes("before-restore") ? "Safety copy made before a restore" : "Weekly backup"} · ${Math.max(1, Math.round((+f.size || 0) / 1024))} KB</span></span></button>`)}</div>
      <div class="actions"><button class="btn ghost" data-close="">Cancel</button></div>`));
    if (!id) return;
    const f = files.find((x) => x.id === id);
    if (!(await confirmBox("Restore this backup?", `Replace all current data with the backup from ${fmt(f)}?`, "Restore", false))) return;
    try { await sync.restoreBackup(id); st = store.settings; toast("Backup restored"); } catch (e) { toast("Restore failed: " + e.message, 5000); }
    render();
  }

  const setPath = (path, val) => { const ks = path.split("."); let o = st; ks.slice(0, -1).forEach((k) => (o = o[k])); o[ks.at(-1)] = val; };
  const getPath = (path) => path.split(".").reduce((o, k) => o[k], st);

  v.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.id === "cid") { local.set("googleClientId", t.value.trim()); toast("Client ID saved on this device"); return render(); }
    if (t.id === "payModes") {
      const list = [...new Set(t.value.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 8);
      if (!list.length) { t.value = (st.paymentModes || []).join(", "); return toast("Add at least one payment mode"); }
      st.paymentModes = list; t.value = list.join(", "); return save("Saved");
    }
    if (t.dataset.path === "receipt.upiId" && t.value.trim() && !/^[\w.\-]{2,}@[a-zA-Z][\w.]{1,}$/.test(t.value.trim())) { toast("That doesn't look like a UPI ID (e.g. name@okhdfcbank)", 4000); t.focus(); return; }
    if (t.dataset.path) {
      if (!t.value.trim() && t.type !== "text") { t.value = getPath(t.dataset.path); return toast("This can't be empty"); }   // e.g. reminder time
      if (!t.value.trim() && ["branding.name", "healthIssuesTitle"].includes(t.dataset.path)) { t.value = getPath(t.dataset.path); return toast("This can't be empty"); }
      setPath(t.dataset.path, t.value); return save("Saved");
    }
    if (t.dataset.num) {   // only accept numbers inside the field's allowed range
      const n = parseFloat(t.value), min = t.min !== "" ? +t.min : -Infinity, max = t.max !== "" ? +t.max : Infinity;
      if (!isFinite(n) || n < min || n > max) { t.value = getPath(t.dataset.num); return toast(`Please enter a number${isFinite(min) ? ` from ${min}` : ""}${isFinite(max) ? ` to ${max}` : ""}`); }
      setPath(t.dataset.num, n); return save("Saved");
    }
    if (t.dataset.bool) { setPath(t.dataset.bool, t.checked); return save("Saved"); }
    if (t.dataset.slotname) { st.slotCatalog[t.dataset.slotname].name = t.value.trim() || st.slotCatalog[t.dataset.slotname].name; return save("Saved"); }
    if (t.dataset.pt) { if (!t.value) { t.value = to24(st.mealPatterns[t.dataset.pt].slots[+t.dataset.i].time); return toast("Please choose a time"); }
      st.mealPatterns[t.dataset.pt].slots[+t.dataset.i].time = to12(t.value); return save("Saved"); }
    if (t.dataset.plabel) { st.mealPatterns[t.dataset.plabel].label = t.value.trim() || st.mealPatterns[t.dataset.plabel].label; await save("Saved"); openType = t.dataset.plabel; return render(); }
    if (t.dataset.addslot) {
      const pk = t.dataset.addslot; openType = pk;
      let id = t.value;
      if (id === "__new") { const sc = await sectionModal(null); if (!sc) return render(); id = uid("s-"); st.slotCatalog[id] = sc; }
      // use the section's usual time/mode from the other plan types (e.g. Lunch → 2:00 pm, Daily)
      const usual = Object.values(st.mealPatterns).flatMap((pt) => pt.slots).find((x) => x.id === id);
      if (id) { st.mealPatterns[pk].slots.push({ id, time: usual?.time || st.slotCatalog[id]?.time || "12:00 pm", mode: usual?.mode || "shared" }); await save("Section added"); }
      return render();
    }
    if (t.dataset.bmi) {
      const i = +t.dataset.bmi, n = parseFloat(t.value), lo = i ? st.bmiBands[i - 1].max : 10, hi = i < 2 ? st.bmiBands[i + 1].max : 60;
      if (!isFinite(n) || n <= lo || n >= hi) { t.value = st.bmiBands[i].max; return toast(`Enter a value between ${lo} and ${hi}`); }
      st.bmiBands[i].max = n; return save("BMI ranges saved");
    }
    if (t.id === "defAllowed") { st.defaults.allowedFood = t.value.split("\n").map((x) => x.trim()).filter(Boolean); return save("Saved"); }
    if (t.dataset.gl) { st.defaults.guidelines[+t.dataset.gl].items = t.value.split("\n").map((x) => x.trim()).filter(Boolean); return save("Saved"); }
    if (t.dataset.list) { getPath(t.dataset.list)[+t.dataset.i][t.dataset.f] = t.value.trim(); return save("Saved"); }
    if (t.id === "wm") { st.branding.watermarkOpacity = +t.value / 100; return save("Saved"); }
    if (t.id === "logo" && t.files[0]) {
      const f = t.files[0]; t.value = "";
      if (f.size > 15e6) return toast("Please use an image under 15 MB");
      // Check it really is a picture the PDF can use, and shrink it (max 800 px, PNG keeps transparency).
      try {
        const url = await new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsDataURL(f); });
        const img = new Image(); img.src = url; await img.decode();
        const k = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
        const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        st.branding.logoDataUrl = cv.toDataURL("image/png");
      } catch { return toast("That file isn't a picture this app can use. Please choose a PNG or JPG image.", 4000); }
      await save("Logo updated"); return render();
    }
    if (t.id === "restore" && t.files[0]) {
      try {
        const obj = JSON.parse(await t.files[0].text());
        const chk = cleanDb(obj);   // throws on a damaged file; nothing on the device changes
        if (!(await confirmBox("Restore backup?", `Replaces everything on this device with ${chk.clients.length} clients and ${chk.plans.length} plans from the file.`, "Restore"))) return;
        await store.replaceAll(obj); st = store.settings; toast("Backup restored"); render();
      } catch (err) { toast("Restore failed: " + err.message, 4000); }
    }
  });
  v.addEventListener("toggle", (e) => { const d = e.target; if (d.classList?.contains("ptype")) openType = d.open ? d.dataset.pk : (openType === d.dataset.pk ? null : openType); }, true);
  v.addEventListener("input", (e) => { if (e.target.id === "wm") v.querySelector("#wmv").textContent = e.target.value + "%"; });
  v.addEventListener("click", async (e) => {
    const b = e.target.closest("button, .chip"); if (!b) return;
    if (b.id === "install") return installApp();
    if (b.id === "connect") { await connectOrSync(); return render(); }
    if (b.id === "disconnect") {
      if (!(await confirmBox("Disconnect Google?", "Syncing stops and the app's permission is removed from this Google account. Your data stays on this device and in Drive; connect again any time.", "Disconnect", false))) return;
      sync.disconnect(); toast("Disconnected from Google"); return render(); }
    if (b.dataset.theme) { applyTheme(b.dataset.theme); return render(); }
    if (b.id === "copyUri") { try { await navigator.clipboard.writeText(G.redirectUri()); toast("Copied"); } catch { v.querySelector("#ruri").select(); toast("Select and copy the address"); } return; }
    if (b.id === "switchAcc") {
      if (G.useRedirect() && store._editorDirty) return toast("Save what you're editing first", 3500);
      try { await sync.switchAccount(); if (sync.syncState().status === "ok") toast(`Connected as ${G.account()?.email || "new account"}`); }
      catch (e) { toast(e.message, 4500); }
      st = store.settings; return render();
    }
    if (b.id === "backupNow") {
      b.disabled = true; b.innerHTML = `<span class="spinner"></span> Saving…`;
      try { const n = await sync.backupNow(); toast("Backup saved in Drive: " + n); } catch (e) { toast(e.code === "auth" ? "Reconnect Google first" : "Backup failed: " + e.message, 4500); }
      return render();
    }
    if (b.id === "showBackups") return pickBackup();
    if (b.dataset.untrash) {
      try { const note = await store.restoreFromTrash(b.dataset.untrash); toast(note || "Restored", note ? 5000 : 2500); } catch (e) { toast(e.message, 4000); }
      return render();
    }
    if (b.dataset.killtrash) {
      if (!(await confirmBox("Delete forever?", "This can't be undone."))) return;
      await store.deleteForever(b.dataset.killtrash); return render();
    }
    if (b.id === "emptyTrash") {
      if (!(await confirmBox("Empty recycle bin?", `${store.data.trash.length} item(s) will be deleted for good. This can't be undone.`, "Empty bin"))) return;
      await store.emptyTrash(); toast("Recycle bin emptied"); return render();
    }
    if (b.id === "logoReset") { st.branding.logoDataUrl = null; await save("Default logo restored"); return render(); }
    const segp = b.parentElement?.dataset.segpath;
    if (segp) { setPath(segp, b.dataset.v); await save("Saved"); return render(); }
    if (b.id === "newType") return newType();
    if (b.dataset.editslot) {
      openType = b.closest("[data-pk]")?.dataset.pk;
      const sc = await sectionModal(st.slotCatalog[b.dataset.editslot]);
      if (sc) { st.slotCatalog[b.dataset.editslot] = sc; await save("Section updated"); }
      return render();
    }
    if (b.dataset.mv) {
      const sl = st.mealPatterns[b.dataset.pk].slots, i = +b.dataset.i, j = i + +b.dataset.mv;
      [sl[i], sl[j]] = [sl[j], sl[i]]; openType = b.dataset.pk; await save(); return render();
    }
    if (b.dataset.rmslot) {
      const sl = st.mealPatterns[b.dataset.rmslot].slots; openType = b.dataset.rmslot;
      if (sl.length === 1) return toast("A plan type needs at least one section");
      const nm = st.slotCatalog[sl[+b.dataset.i].id]?.name || "This section";
      if (!(await confirmBox("Remove section?", `${nm} will be removed from “${st.mealPatterns[b.dataset.rmslot].label}”. Meals already typed in saved plans are kept.`, "Remove"))) return;
      sl.splice(+b.dataset.i, 1); await save("Section removed"); return render();
    }
    if (b.dataset.delpt) {
      const pk = b.dataset.delpt, used = store.data.plans.filter((x) => x.pattern === pk).length, tpl = (store.data.templates || []).filter((x) => x.pattern === pk).length;
      if (used) return toast(`Can't delete: ${used} saved plan${used > 1 ? "s use" : " uses"} this type`, 4000);
      if (tpl) return toast(`Can't delete: ${tpl} template${tpl > 1 ? "s use" : " uses"} this type (Meals → Templates)`, 4000);
      if (!(await confirmBox("Delete plan type?", `“${st.mealPatterns[pk].label}” will be removed.`))) return;
      delete st.mealPatterns[pk];
      for (const c of store.data.clients) if (c.mealPattern === pk) c.mealPattern = "";
      await save("Plan type deleted"); return render();
    }
    if (b.parentElement?.dataset.pm) { openType = b.parentElement.dataset.pm; st.mealPatterns[b.parentElement.dataset.pm].slots[+b.parentElement.dataset.i].mode = b.dataset.v; await save("Saved"); return render(); }
    if (b.parentElement?.id === "bmiPreset") {
      const vals = b.dataset.v === "asian" ? [18.5, 23, 25] : [18.5, 25, 30];
      vals.forEach((x, i) => (st.bmiBands[i].max = x)); await save(b.dataset.v === "asian" ? "Asian-Indian BMI ranges set" : "Standard BMI ranges set"); return render();
    }
    if (b.dataset.rmflag) { const nm = st.healthFlags[+b.dataset.rmflag];
      if (!(await confirmBox("Remove health issue?", `“${nm}” will no longer be offered on the client form. Clients who already have it keep it.`, "Remove"))) return;
      st.healthFlags.splice(+b.dataset.rmflag, 1); await save("Removed"); return render(); }
    if (b.id === "addFlag") { const x = v.querySelector("#newFlag").value.trim(); if (x && !st.healthFlags.includes(x)) { st.healthFlags.push(x); await save("Added"); } return render(); }
    if (b.dataset.rm) { const it = getPath(b.dataset.rm)[+b.dataset.i], nm = it && (it.label || it.text || it.title || it.value || "");
      if (!(await confirmBox("Remove this row?", nm ? `“${nm}” will be removed.` : "This row will be removed.", "Remove"))) return;
      getPath(b.dataset.rm).splice(+b.dataset.i, 1); await save("Removed"); return render(); }
    if (b.dataset.addrow) {
      const list = getPath(b.dataset.addrow);
      list.push(b.dataset.addrow === "measurements.sites" ? { key: uid("m"), label: "", hint: "" } : b.dataset.addrow === "defaults.exercise" ? { text: "", duration: "", link: "" } : { value: "", label: "" });
      await save(); return render();
    }
    if (b.id === "backup") return downloadBlob(new Blob([JSON.stringify(store.exportable(), null, 1)], { type: "application/json" }), `diet-planner-backup-${todayIso()}.json`);
    if (b.id === "resetSettings" && (await confirmBox("Reset settings?", "Branding, meal times, defaults and ranges go back to the original values. Your own plan types and sections are kept, and clients and plans are not affected.", "Reset"))) {
      const keepTypes = Object.fromEntries(Object.entries(st.mealPatterns).filter(([k]) => !(k in DEFAULT_SETTINGS.mealPatterns)));
      const keepSlots = Object.fromEntries(Object.entries(st.slotCatalog).filter(([k]) => !(k in DEFAULT_SETTINGS.slotCatalog)));
      st = structuredClone(DEFAULT_SETTINGS);
      Object.assign(st.mealPatterns, keepTypes); Object.assign(st.slotCatalog, keepSlots);
      await save("Settings reset"); return render();
    }
    if (b.id === "demo") { await addDemo(); toast("Demo client added"); ctx.go("#/clients"); }
  });
  async function newType() {
    const r = await modal(String(html`<h2>New plan type</h2>
      <div class="stack" style="margin-top:12px">
        <label class="field"><span>Name</span><input type="text" id="nm" placeholder="e.g. Intermittent Fasting"></label>
        <label class="field"><span>Start from</span><select id="from"><option value="">Blank (one section)</option>
          ${Object.entries(st.mealPatterns).map(([k, p]) => html`<option value="${k}">Copy of ${p.label}</option>`)}</select></label></div>
      <div class="actions"><button class="btn ghost" data-close="">Cancel</button><button class="btn teal" id="ok">Create</button></div>`),
      { onMount: (el, close) => { el.querySelector("#nm").focus(); el.querySelector("#ok").onclick = () => {
        const name = el.querySelector("#nm").value.trim();   // check here so the pop-up stays open on a mistake
        if (!name) { toast("Please enter a name"); return el.querySelector("#nm").focus(); }
        if (Object.values(st.mealPatterns).some((p) => p.label.toLowerCase() === name.toLowerCase())) { toast("A plan type with that name already exists"); return el.querySelector("#nm").focus(); }
        close({ name, from: el.querySelector("#from").value }); }; } });
    if (!r) return;
    if (!r.name) return toast("Please enter a name");
    if (Object.values(st.mealPatterns).some((p) => p.label.toLowerCase() === r.name.toLowerCase())) return toast("A plan type with that name already exists");
    const id = uid("t-");
    st.mealPatterns[id] = { label: r.name, slots: r.from ? structuredClone(st.mealPatterns[r.from].slots) : [{ id: Object.keys(st.slotCatalog)[0], time: "7:00 am", mode: "shared" }] };
    openType = id; await save("Plan type created"); render();
  }

  render();
}

// Pick name, icon and colour for a meal section (new or existing).
async function sectionModal(sc) {
  let ic = sc?.icon || SLOT_ICONS[0], col = SLOT_COLORS.findIndex((c) => c.accent === sc?.accent); if (col < 0) col = 0;
  return modal(String(html`<h2>${sc ? "Edit section" : "New section"}</h2>
    <div class="stack" style="margin-top:12px">
      <label class="field"><span>Name</span><input type="text" id="sn" value="${sc?.name || ""}" placeholder="e.g. Pre-workout"></label>
      <div><span class="field-label">Icon</span><div class="chips" id="ics">${SLOT_ICONS.map((n) => html`<button type="button" class="chip ${n === ic ? "on" : ""}" data-ic="${n}" aria-label="${n}">${icon(n)}</button>`)}</div></div>
      <div><span class="field-label">Colour</span><div class="chips" id="cols">${SLOT_COLORS.map((c, i) => html`<button type="button" class="swatch ${i === col ? "on" : ""}" data-col="${i}" style="background:${c.fill};border-color:${c.accent}" aria-label="Colour ${i + 1}"><span style="background:${c.accent}"></span></button>`)}</div></div>
    </div>
    <div class="actions"><button class="btn ghost" data-close="">Cancel</button><button class="btn teal" id="ok">Save</button></div>`), {
    onMount(el, close) {
      el.querySelector("#sn").focus();
      el.querySelector("#ics").onclick = (e) => { const b = e.target.closest("[data-ic]"); if (!b) return; ic = b.dataset.ic; el.querySelectorAll("#ics .chip").forEach((x) => x.classList.toggle("on", x === b)); };
      el.querySelector("#cols").onclick = (e) => { const b = e.target.closest("[data-col]"); if (!b) return; col = +b.dataset.col; el.querySelectorAll("#cols .swatch").forEach((x) => x.classList.toggle("on", x === b)); };
      el.querySelector("#ok").onclick = () => { const name = el.querySelector("#sn").value.trim(); if (!name) return toast("Please enter a name"); close({ name, icon: ic, ...SLOT_COLORS[col] }); };
    },
  });
}

// A made-up client to try the app with.
async function addDemo() {
  const t = todayIso(), d = (n) => addDaysIso(t, n);
  const c = await store.upsertClient({ name: "Demo Client", phone: "", age: 34, sex: "Female", heightFt: 5, heightIn: 4, bloodGroup: "O+",
    foodPreference: "Vegetarian", likes: "Paneer, fruits", dislikes: "Example food", allergies: "None", medical: "Example condition",
    healthFlags: ["Acidity", "Bloating"], water: "8-10 Glasses / Day", mealPattern: "3meal",
    weightLog: [{ date: d(-28), kg: 74.2 }, { date: d(-21), kg: 73.5 }, { date: d(-14), kg: 72.9 }, { date: d(-7), kg: 72.1 }, { date: t, kg: 71.6 }],
    measurementLog: [{ date: d(-28), arm: 12.5, chest: 37, waist: 33.5, abdomen: 36, hips: 40.5, thigh: 23.5 }, { date: t, arm: 12.2, chest: 36.6, waist: 32.6, abdomen: 35.1, hips: 40, thigh: 23.1 }] });
  store.learnMeals(["1 glass warm lemon water", "1 Bowl Vegetable Upma + Chutney", "2 Besan Chilla + Curd", "1 Bowl Oats + 1 Fruit",
    "2 Roti + 1 Bowl Dal + Salad", "1 Bowl Brown Rice + Rajma + Salad", "1 Bowl Veg Soup + Paneer Tikka", "1 Cup Green Tea + Roasted Chana"]);
  await store.commit("library");
  return c;
}
