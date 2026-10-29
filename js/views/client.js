// Client profile: progress, weight & measurement logs, plans, appointments.
import { store, todayIso, uid } from "../store.js";
import { html, raw, icon, toast, confirmBox, modal, addDaysIso, daysBetween, fmtDate, to12, initials, avatarColor, weightChartSvg } from "../ui.js";
import { clientMetrics, clientStatus, planEnd, renderablePlan, typeLabel, programOf } from "../model.js";
import { openExport } from "./exportDialog.js";
import { appointmentModal } from "./appointments.js";
import { waLink, appointmentMessage, removeReminder } from "../reminders.js";

// "+91 9876543210" (older entries may contain spaces or the code itself)
function showPhone(c) {
  const cc = String(c.phoneCode || store.settingsRO.defaultCountryCode || "91").replace(/\D/g, "");
  let d = String(c.phone || "").replace(/\D/g, "");
  if (d.length > 10 && d.startsWith(cc)) d = d.slice(cc.length);
  return `+${cc} ${d}`;
}

export default function clientView(ctx, id) {
  const c = store.client(id);
  if (!c) { toast("That client was deleted"); ctx.goReplace("#/clients"); return; }   // e.g. Back after deleting
  const s = store.settings;
  ctx.title(c.name);
  ctx.back("#/clients");
  ctx.actions(html`<a class="icon-btn" href="#/client/${id}/edit" aria-label="Edit client">${icon("edit")}</a>`);
  // ---------- program (package) card ----------
  const programCard = () => {
    const pg = programOf(c);
    if (!pg) return html`<div class="card row"><div class="grow"><h2>Program</h2><div class="small muted">Set the program length (e.g. 3 months) to track days given, days left and holds.</div></div>
      <button class="btn small teal" id="pgEdit">${icon("calendar")} Set program</button></div>`;
    const pct = Math.round((pg.dayNo / pg.total) * 100);
    return html`<div class="card">
      <div class="card-head"><h2>Program</h2><div class="row" style="gap:6px">
        ${pg.ended ? "" : html`<button class="btn small ghost" id="pgHold">${icon("bell")} Hold</button>`}
        <button class="btn small ghost" id="pgEdit">${icon("edit")} Edit</button></div></div>
      <div class="small muted">${fmtDate(pg.start, { year: true })} – ${fmtDate(pg.effEnd, { year: true })} · ${pg.total} days${pg.holdDays ? ` + ${pg.holdDays} hold day${pg.holdDays > 1 ? "s" : ""}` : ""}</div>
      ${pg.onHold ? html`<div class="banner" style="margin:10px 0 0"><span class="grow"><b>On hold</b> ${fmtDate(pg.onHold.from)} – ${fmtDate(pg.onHold.to)}${pg.onHold.reason ? ` · ${pg.onHold.reason}` : ""}</span>
        <button class="btn small" id="pgResume" data-h="${pg.onHold.id}">Resume today</button></div>` : ""}
      <div style="margin:12px 0 4px;display:flex;justify-content:space-between" class="small"><b>${pg.ended ? "Program completed" : pg.started ? `Day ${pg.dayNo} of ${pg.total}` : `Starts ${fmtDate(pg.start, { weekday: true })}`}</b><span class="muted">${pct}%</span></div>
      <div style="height:8px;background:var(--soft);border-radius:99px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--teal)"></div></div>
      <div class="tiles" style="margin-top:12px">
        <div class="tile"><div class="eyebrow">Plan days given</div><div class="v">${pg.given}</div><div class="s">of ${pg.total}${c.program.priorDays ? ` · incl. ${c.program.priorDays} before app` : ""}</div></div>
        <div class="tile"><div class="eyebrow">Not yet planned</div><div class="v" style="color:${pg.remaining ? "var(--amber)" : "var(--green)"}">${pg.remaining}</div><div class="s">days</div></div>
        <div class="tile"><div class="eyebrow">Days left</div><div class="v">${pg.daysLeft}</div><div class="s">ends ${fmtDate(pg.effEnd)}</div></div>
        <div class="tile"><div class="eyebrow">On hold</div><div class="v">${pg.holdDays}</div><div class="s">day${pg.holdDays === 1 ? "" : "s"} in total</div></div>
      </div>
      ${pg.holds.length ? html`<details class="more" style="margin-top:10px"><summary>Holds (${pg.holds.length})</summary><div class="list">${pg.holds.map((h) => html`
        <div class="list-item"><div class="grow"><b>${fmtDate(h.from)} – ${fmtDate(h.to, { year: true })}</b> <span class="small muted">· ${daysBetween(h.from, h.to) + 1} days${h.reason ? ` · ${h.reason}` : ""}</span></div>
          <button class="icon-btn danger" data-delhold="${h.id}" aria-label="Delete hold">${icon("trash")}</button></div>`)}</div></details>` : ""}
    </div>`;
  };

  const draw = () => {
    const m = clientMetrics(c), st = clientStatus(c);
    const plans = store.plansFor(id);
    const appts = store.data.appointments.filter((a) => a.clientId === id && a.date >= todayIso()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const notes = [...(c.privateNotes || [])].sort((a, b) => b.date.localeCompare(a.date) || (b.at || "").localeCompare(a.at || ""));
    const mlog = [...(c.measurementLog || [])].sort((a, b) => b.date.localeCompare(a.date));
    const sites = s.measurements.sites, unit = s.measurements.unit;
    const pref = s.foodPreferences.find((p) => p.label === c.foodPreference);
    const wa = c.phone ? waLink(c.phone, `Hi ${c.name.split(" ")[0]}, `, c.phoneCode) : null;

    ctx.view().innerHTML = String(html`
    <div class="card">
      <div class="row">
        <div class="avatar" style="background:${avatarColor(c.name)};width:52px;height:52px;font-size:18px">${initials(c.name)}</div>
        <div class="grow">
          <div class="row wrap" style="gap:6px"><span class="badge ${st.cls}">${st.label}</span>
            ${pref ? html`<span class="badge" style="color:${pref.color}">● ${pref.label}</span>` : ""}
            ${c.bloodGroup ? html`<span class="badge navy">${c.bloodGroup}</span>` : ""}
            <span class="badge teal">${c.mealPattern ? (s.mealPatterns[c.mealPattern]?.label || "Plan type: removed") : "Plan type: not set"}</span></div>
          <div class="small muted" style="margin-top:4px">${[c.code && `ID ${c.code}`, c.age && `${c.age} yrs`, c.sex, c.heightFt && `${c.heightFt}'${c.heightIn || 0}"`, c.phone && showPhone(c), c.email].filter(Boolean).join(" · ")}</div>
        </div></div>
      <div class="row wrap" style="margin-top:14px">
        <a class="btn teal" href="#/plan/new/${id}">${icon("plus")} New plan</a>
        <button class="btn line" id="addAppt">${icon("calendar")} Appointment</button>
        ${wa ? html`<a class="btn line" href="${wa}" target="_blank" rel="noopener">${icon("whatsapp")} WhatsApp</a>` : ""}
        ${c.email ? html`<a class="btn line" href="${"mailto:" + encodeURIComponent(c.email).replace("%40", "@")}">${icon("mail")} Email</a>` : ""}
      </div>
    </div>

    ${programCard()}

    <div class="card">
      <div class="card-head"><h2>Progress</h2><button class="btn small ghost" id="addW">${icon("scale")} Add weight</button></div>
      <div class="tiles">
        <div class="tile ${m.band ? "colored" : ""}" style="${m.band ? `background:${m.band.color}` : ""}"><div class="eyebrow">BMI</div><div class="v">${m.bmi ?? "–"}</div><div class="s">${m.band ? `${m.band.label} · at ${m.cur.kg} kg` : "Add height & weight"}</div></div>
        <div class="tile"><div class="eyebrow">Starting</div><div class="v">${m.start ? m.start.kg : "–"}<small> kg</small></div><div class="s">${m.start ? fmtDate(m.start.date) : ""}</div></div>
        <div class="tile"><div class="eyebrow">Current</div><div class="v">${m.cur ? m.cur.kg : "–"}<small> kg</small></div><div class="s">${m.cur ? fmtDate(m.cur.date) : ""}</div></div>
        <div class="tile"><div class="eyebrow">${m.lost == null || m.lost >= 0 ? "Total lost" : "Gained"}</div>
          <div class="v" style="color:${m.lost > 0 ? "var(--green)" : m.lost < 0 ? "var(--amber)" : ""}">${m.lost == null ? "–" : Math.abs(m.lost)}<small> kg</small></div><div class="s">since start</div></div>
      </div>
      <div class="chart-wrap" style="margin-top:14px">${raw(weightChartSvg(m.log))}</div>
      ${m.log.length ? html`<details class="more" style="margin-top:8px"><summary>Weight history (${m.log.length})</summary>
        <div class="table-scroll"><table class="simple"><tr><th>Date</th><th>Weight</th><th>Change</th><th></th></tr>
        ${[...m.log].reverse().map((w, i, arr) => { const prev = arr[i + 1]; const d = prev ? +(w.kg - prev.kg).toFixed(1) : null;
          return html`<tr><td>${fmtDate(w.date, { weekday: true })}</td><td><b>${w.kg} kg</b></td>
            <td class="${d < 0 ? "down" : d > 0 ? "up" : ""}">${d == null ? "" : (d > 0 ? "+" : "") + d}</td>
            <td style="text-align:right"><button class="icon-btn danger" data-delw="${w.date}" aria-label="Delete">${icon("trash")}</button></td></tr>`; })}
        </table></div></details>` : ""}
    </div>

    <div class="card">
      <div class="card-head"><h2>Body measurements <span class="small muted">(${unit === "in" ? "inches" : unit})</span></h2><button class="btn small ghost" id="addM">${icon("ruler")} Add</button></div>
      ${mlog.length ? html`<div class="table-scroll"><table class="simple">
        <tr><th>Date</th>${sites.map((x) => html`<th>${x.label}</th>`)}<th></th></tr>
        ${mlog.map((r) => html`<tr><td>${fmtDate(r.date)}</td>${sites.map((x) => html`<td>${r[x.key] ?? "–"}</td>`)}
          <td><button class="icon-btn danger" data-delm="${r.date}" aria-label="Delete">${icon("trash")}</button></td></tr>`)}
      </table></div>
      <div class="m-cards">${mlog.map((r) => html`<div class="m-card"><div class="row between"><b>${fmtDate(r.date, { year: true })}</b>
          <button class="icon-btn danger" data-delm="${r.date}" aria-label="Delete">${icon("trash")}</button></div>
        <div class="m-grid">${sites.map((x) => html`<div><span class="tiny muted">${x.label}</span><b>${r[x.key] ?? "–"}</b></div>`)}</div></div>`)}</div>` : html`<div class="empty small">No measurements yet.</div>`}
    </div>

    <div class="card" style="border:1.5px dashed var(--line);box-shadow:none">
      <div class="card-head"><h2>Private notes <span class="small muted">· only you see these</span></h2><button class="btn small ghost" id="addN">${icon("plus")} Add</button></div>
      ${notes.length ? html`<div class="list">${notes.map((n) => html`
        <div class="list-item" style="align-items:flex-start"><div class="grow">
          <div class="tiny muted" style="font-weight:600">${fmtDate(n.date, { weekday: true, year: true })}</div>
          <div style="white-space:pre-wrap">${n.text}</div></div>
          <button class="icon-btn" data-editn="${n.id}" aria-label="Edit note">${icon("edit")}</button>
          <button class="icon-btn danger" data-deln="${n.id}" aria-label="Delete note">${icon("trash")}</button></div>`)}</div>`
      : html`<div class="empty small">No notes yet. Notes never appear in PDFs or images.</div>`}
    </div>

    <div class="card">
      <div class="card-head"><h2>Health & food</h2><a class="small" href="#/client/${id}/edit">Edit</a></div>
      <div class="grid two small">
        <div><div class="eyebrow">Medical problems</div><div>${c.medical || "–"}</div></div>
        <div><div class="eyebrow">${s.healthIssuesTitle}</div><div class="chips" style="margin-top:4px">${(c.healthFlags || []).length ? DietRender.healthItems(c, s).map((x) => html`<span class="badge red">${x.name}${x.level ? ` · ${x.level.label}` : ""}</span>`) : "–"}</div></div>
        <div><div class="eyebrow">Food allergies</div><div>${c.allergies || "–"}</div></div>
        <div><div class="eyebrow">Food preference notes</div><div>${c.foodNotes || "–"}</div></div>
        <div><div class="eyebrow">Likes</div><div>${c.likes || "–"}</div></div>
        <div><div class="eyebrow">Dislikes</div><div>${c.dislikes || "–"}</div></div>
        <div><div class="eyebrow">Water intake</div><div>${c.water || "–"}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Plans</h2><a class="btn small ghost" href="#/plan/new/${id}">${icon("plus")} New</a></div>
      ${plans.length ? html`<div class="list">${plans.map((p) => html`
        <div class="list-item">
          <a class="grow" href="#/plan/${p.id}" style="text-decoration:none;color:inherit">
            <b>${p.days === 7 && p.weekNumber ? `Week ${p.weekNumber}` : `${p.days}-Day Plan`}</b>
            <div class="small muted">${fmtDate(p.startDate)} – ${fmtDate(planEnd(p), { year: true })} · ${typeLabel(p)}</div></a>
          <button class="icon-btn" data-exp="${p.id}" aria-label="Export">${icon("download")}</button>
          <button class="icon-btn danger" data-delp="${p.id}" aria-label="Delete plan">${icon("trash")}</button>
        </div>`)}</div>` : html`<div class="empty small">No plans yet.</div>`}
    </div>

    <div class="card">
      <div class="card-head"><h2>Upcoming appointments</h2></div>
      ${appts.length ? html`<div class="list">${appts.map((a) => html`
        <div class="list-item"><div class="grow"><b>${fmtDate(a.date, { weekday: true })} · ${to12(a.time)}</b><div class="small muted">${a.type}${a.notes ? " · " + a.notes : ""}</div></div>
          ${c.phone ? html`<a class="icon-btn" href="${waLink(c.phone, appointmentMessage(a, c), c.phoneCode)}" target="_blank" rel="noopener" aria-label="Send WhatsApp reminder">${icon("whatsapp")}</a>` : ""}
          <button class="icon-btn" data-edita="${a.id}" aria-label="Edit">${icon("edit")}</button></div>`)}</div>`
      : html`<div class="empty small">No upcoming appointments.</div>`}
    </div>`);
  };

  const v = ctx.view();
  v.addEventListener("click", async (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.id === "pgEdit") return programModal();
    if (t.id === "pgHold") return holdModal();
    if (t.id === "pgResume") {   // hold ends: resume from today
      const h = c.program.holds.find((x) => x.id === t.dataset.h), y = addDaysIso(todayIso(), -1);
      if (y < h.from) c.program.holds = c.program.holds.filter((x) => x !== h); else h.to = y;
      await store.upsertClient(c); toast("Program resumed today"); return draw();
    }
    if (t.dataset.delhold && (await confirmBox("Delete hold?", "The program end date moves back by these days."))) {
      c.program.holds = c.program.holds.filter((x) => x.id !== t.dataset.delhold); await store.upsertClient(c); return draw(); }
    if (t.id === "addW") return weightModal();
    if (t.id === "addM") return measureModal();
    if (t.id === "addN") return noteModal(null);
    if (t.dataset.editn) return noteModal(c.privateNotes.find((n) => n.id === t.dataset.editn));
    if (t.dataset.deln && (await confirmBox("Delete note?", "This note will be removed. It goes to the Recycle bin (Settings) for 30 days."))) {
      const n0 = c.privateNotes.find((n) => n.id === t.dataset.deln); if (n0) store.toTrash("note", n0, { clientId: c.id, clientName: c.name });
      c.privateNotes = c.privateNotes.filter((n) => n.id !== t.dataset.deln); await store.upsertClient(c); return draw(); }
    if (t.id === "addAppt") { await appointmentModal({ clientId: id }); return draw(); }
    if (t.dataset.edita) { await appointmentModal(store.data.appointments.find((a) => a.id === t.dataset.edita)); return draw(); }
    if (t.dataset.exp) return openExport(c, renderablePlan(store.plan(t.dataset.exp)));
    if (t.dataset.delw && (await confirmBox("Delete weight?", `Remove the entry for ${fmtDate(t.dataset.delw)}?`))) {
      c.weightLog = c.weightLog.filter((w) => w.date !== t.dataset.delw); await store.upsertClient(c); draw(); }
    if (t.dataset.delm && (await confirmBox("Delete measurements?", `Remove the visit on ${fmtDate(t.dataset.delm)}?`))) {
      c.measurementLog = c.measurementLog.filter((w) => w.date !== t.dataset.delm); await store.upsertClient(c); draw(); }
    if (t.dataset.delp) {
      const p = store.plan(t.dataset.delp);
      if (await confirmBox("Delete plan?", "This plan and its reminder will be removed. It goes to the Recycle bin (Settings) for 30 days.")) {
        try { await removeReminder(p.reminderEventId); } catch {}
        await store.deletePlan(p.id); toast("Plan deleted"); draw(); }
    }
  });

  async function weightModal() {
    const r = await modal(String(html`<h2>Add weight</h2>
      <div class="form-grid" style="margin-top:12px">
        <label class="field half"><span>Date</span><input type="date" id="wd" value="${todayIso()}"></label>
        <label class="field half"><span>Weight (kg)</span><input type="number" id="wk" step="0.1" inputmode="decimal" autofocus></label></div>
      <div class="actions"><button class="btn ghost" data-close="">Cancel</button><button class="btn teal" id="ok">Save</button></div>`),
      { onMount: (el, close) => { el.querySelector("#wk").focus(); el.querySelector("#ok").onclick = () => {
        const date = el.querySelector("#wd").value, kg = parseFloat(el.querySelector("#wk").value);
        if (!date) return toast("Please pick a date");
        if (!(kg >= 20 && kg <= 300)) { toast("Weight must be between 20 and 300 kg"); return el.querySelector("#wk").focus(); }
        close({ date, kg: Math.round(kg * 10) / 10 }); }; } });   // the pop-up stays open until the value is right
    if (!r || !r.kg || !r.date) return;
    const had = (c.weightLog || []).find((w) => w.date === r.date);   // one weight per day: ask before replacing
    if (had && +had.kg !== r.kg && !(await confirmBox("Replace the weight for that day?", `${had.kg} kg is already recorded for ${fmtDate(r.date)}. Replace it with ${r.kg} kg?`, "Replace", false))) return;
    c.weightLog = (c.weightLog || []).filter((w) => w.date !== r.date).concat(r);
    await store.upsertClient(c); toast("Weight saved"); draw();
  }
  async function programModal() {
    const pg = c.program || {}, start0 = pg.start || todayIso();
    const presets = [[30, "1 month"], [60, "2 months"], [90, "3 months"], [180, "6 months"]];
    const r = await modal(String(html`<h2>Program duration</h2><p class="small muted">Hold days are added on top automatically.</p>
      <div class="form-grid" style="margin-top:10px">
        <label class="field half"><span>Start date</span><input type="date" id="ps" value="${start0}"></label>
        <label class="field half"><span>End date</span><input type="date" id="pe" value="${pg.end || addDaysIso(start0, 89)}"></label>
        <div class="full"><span class="field-label">Quick length</span><div class="seg" id="pp">${presets.map(([d, l]) => html`<button type="button" data-d="${d}">${l}</button>`)}</div></div>
        <label class="field half"><span>Or number of days</span><input type="number" id="pd" min="1" max="1000" inputmode="numeric"></label>
        <label class="field half"><span>Plan days already given before this app</span><input type="number" id="pg0" min="0" max="1000" value="${pg.priorDays || ""}" placeholder="0" inputmode="numeric"></label>
        <div class="full small muted" id="plen"></div>
      </div>
      <div class="actions">${c.program ? html`<button class="btn ghost" data-close="remove" style="flex:none;color:var(--coral)">${icon("trash")}</button>` : ""}
        <button class="btn ghost" data-close="">Cancel</button><button class="btn teal" id="ok">Save</button></div>`), {
      onMount(el, close) {
        const ps = el.querySelector("#ps"), pe = el.querySelector("#pe"), pd = el.querySelector("#pd");
        const show = () => { el.querySelector("#plen").textContent = ps.value && pe.value && pe.value >= ps.value ? `${daysBetween(ps.value, pe.value) + 1} days` : "End date must be after the start date"; };
        const setDays = (n) => { if (ps.value && n > 0) pe.value = addDaysIso(ps.value, n - 1); show(); };
        el.querySelector("#pp").onclick = (e) => { const b = e.target.closest("button"); if (b) { pd.value = b.dataset.d; setDays(+b.dataset.d); } };
        pd.oninput = () => setDays(+pd.value);
        ps.onchange = () => { if (pd.value) setDays(+pd.value); show(); }; pe.onchange = show; show();
        el.querySelector("#ok").onclick = () => { if (!ps.value || !pe.value || pe.value < ps.value) return toast("Please check the dates"); close({ start: ps.value, end: pe.value, priorDays: Math.max(0, parseInt(el.querySelector("#pg0").value, 10) || 0) }); };
      },
    });
    if (!r) return;
    if (r === "remove") { if (await confirmBox("Remove program?", "Program dates and holds are removed. Plans are kept.")) { delete c.program; await store.upsertClient(c); draw(); } return; }
    c.program = { ...(c.program || {}), ...r, holds: c.program?.holds || [] };
    await store.upsertClient(c); toast("Program saved"); draw();
  }
  async function holdModal() {
    const pg = programOf(c);
    const r = await modal(String(html`<h2>Put program on hold</h2><p class="small muted">The end date moves later by the number of hold days. New plans skip the hold.</p>
      <div class="form-grid" style="margin-top:10px">
        <label class="field half"><span>From</span><input type="date" id="hf" min="${pg.start}" value="${todayIso() < pg.start ? pg.start : todayIso()}"></label>
        <label class="field half"><span>To (last day of hold)</span><input type="date" id="ht" min="${pg.start}" value="${addDaysIso(todayIso() < pg.start ? pg.start : todayIso(), 6)}"></label>
        <label class="field full"><span>Reason (optional)</span><input type="text" id="hr" placeholder="e.g. Travelling, festival, illness"></label>
        <div class="full small muted" id="hl"></div></div>
      <div class="actions"><button class="btn ghost" data-close="">Cancel</button><button class="btn teal" id="ok">Put on hold</button></div>`), {
      onMount(el, close) {
        const f = el.querySelector("#hf"), t = el.querySelector("#ht");
        const show = () => { el.querySelector("#hl").textContent = f.value && t.value && t.value >= f.value ? `${daysBetween(f.value, t.value) + 1} hold days` : "The last day must be on or after the first day"; };
        f.onchange = show; t.onchange = show; show();
        el.querySelector("#ok").onclick = () => {
          if (!f.value || !t.value || t.value < f.value) return toast("Please check the dates");
          if (f.value < pg.start) return toast("A hold can't start before the program starts");
          const pi0 = DietRender.programInfo(c, todayIso(), []);
          if (pi0 && f.value > pi0.effEnd) return toast("The program has already ended by then");
          if ((c.program.holds || []).some((h) => !(t.value < h.from || f.value > h.to))) return toast("This overlaps another hold");
          close({ from: f.value, to: t.value, reason: el.querySelector("#hr").value.trim() });
        };
      },
    });
    if (!r) return;
    c.program.holds = [...(c.program.holds || []), { id: uid("h-"), ...r }];
    await store.upsertClient(c); toast(`On hold for ${daysBetween(r.from, r.to) + 1} days`); draw();
  }
  async function noteModal(n) {
    const r = await modal(String(html`<h2>${n ? "Edit note" : "Private note"}</h2><p class="small muted">Only visible in the app. Never printed.</p>
      <div class="stack" style="margin-top:8px">
        <label class="field"><span>Date</span><input type="date" id="nd" value="${n?.date || todayIso()}"></label>
        <label class="field"><span>Note</span><textarea id="nt" rows="5">${n?.text || ""}</textarea></label></div>
      <div class="actions"><button class="btn ghost" data-close="">Cancel</button><button class="btn teal" id="ok">Save</button></div>`),
      { onMount: (el, close) => { el.querySelector("#nt").focus(); el.querySelector("#ok").onclick = () => {
        const date = el.querySelector("#nd").value, text = el.querySelector("#nt").value.trim();
        if (!date) return toast("Please pick a date");
        if (!text) { toast("Please write the note"); return el.querySelector("#nt").focus(); }
        close({ date, text }); }; } });
    if (!r || !r.text || !r.date) return;
    c.privateNotes = c.privateNotes || [];
    if (n) Object.assign(n, r); else c.privateNotes.push({ id: uid("n-"), at: new Date().toISOString(), ...r });
    await store.upsertClient(c); toast("Note saved"); draw();
  }
  async function measureModal() {
    const sites = s.measurements.sites;
    const r = await modal(String(html`<h2>Add measurements</h2><p class="small muted">In ${s.measurements.unit === "in" ? "inches" : s.measurements.unit}. Leave blank to skip.</p>
      <div class="form-grid" style="margin-top:8px">
        <label class="field full"><span>Date</span><input type="date" id="md" value="${todayIso()}"></label>
        ${sites.map((x) => html`<label class="field half"><span>${x.label}${x.hint ? ` (${x.hint})` : ""}</span><input type="number" step="0.1" inputmode="decimal" data-k="${x.key}"></label>`)}</div>
      <div class="actions"><button class="btn ghost" data-close="">Cancel</button><button class="btn teal" id="ok">Save</button></div>`),
      { onMount: (el, close) => { el.querySelector("#ok").onclick = () => {
        const o = { date: el.querySelector("#md").value }, maxM = s.measurements.unit === "in" ? 100 : 250;
        if (!o.date) return toast("Please pick a date");
        let bad = null;
        el.querySelectorAll("[data-k]").forEach((i) => { if (i.value === "") return; const v = parseFloat(i.value);
          if (!(v > 0 && v <= maxM)) bad ||= i; else o[i.dataset.k] = Math.round(v * 10) / 10; });
        if (bad) { toast(`Measurements must be between 0 and ${maxM}`); return bad.focus(); }
        if (Object.keys(o).length < 2) return toast("Enter at least one measurement");
        close(o); }; } });
    if (!r || !r.date || Object.keys(r).length < 2) return;
    const prev = (c.measurementLog || []).find((w) => w.date === r.date);   // same date: add to that visit, don't erase it
    c.measurementLog = (c.measurementLog || []).filter((w) => w.date !== r.date).concat({ ...(prev || {}), ...r });
    await store.upsertClient(c); toast("Measurements saved"); draw();
  }
  draw();
}
