// Appointments + reminders (Google Calendar when connected, otherwise .ics file), WhatsApp reminder.
import { store, todayIso } from "../store.js";
import { html, icon, toast, modal, confirmBox, fmtDate, to12, initials, avatarColor } from "../ui.js";
import { calendarReady, pushReminder, removeReminder, appointmentReminder, icsFile, waLink, appointmentMessage } from "../reminders.js";
import { downloadFiles } from "../export.js";

const TYPES = ["Consultation", "Follow-up", "Weigh-in", "Call", "Other"];

export async function appointmentModal(a) {
  const isNew = !a?.id;
  a = { type: "Follow-up", date: todayIso(), time: "17:00", duration: 30, notes: "", ...a };
  const clients = [...store.data.clients].sort((x, y) => x.name.localeCompare(y.name));
  const r = await modal(String(html`<h2>${isNew ? "New appointment" : "Edit appointment"}</h2>
    <div class="form-grid" style="margin-top:12px">
      <label class="field full"><span>Client</span><select id="c">${clients.map((c) => html`<option value="${c.id}" ${c.id === a.clientId ? "selected" : ""}>${c.name}</option>`)}</select></label>
      <label class="field half"><span>Date</span><input type="date" id="d" value="${a.date}"></label>
      <label class="field"><span>Time</span><input type="time" id="t" value="${a.time}"></label>
      <label class="field"><span>Minutes</span><input type="number" id="m" value="${a.duration}" min="5" step="5"></label>
      <div class="full"><span class="field-label">Type</span><div class="chips" id="ty">${TYPES.map((x) => html`<button type="button" class="chip ${x === a.type ? "on" : ""}" data-v="${x}">${x}</button>`)}</div></div>
      <label class="field full"><span>Notes</span><textarea id="n" rows="2">${a.notes}</textarea></label>
    </div>
    <p class="tiny muted">${calendarReady() ? "Added to your Google Calendar with alerts 1 day and 1 hour before." : "Google Calendar not connected: you can download a calendar file after saving."}</p>
    <div class="actions">${isNew ? "" : html`<button class="btn ghost" id="del" style="flex:none">${icon("trash")}</button>`}
      <button class="btn ghost" data-close="">Cancel</button><button class="btn teal" id="ok">Save</button></div>`), {
    onMount(el, close) {
      let type = a.type;
      el.querySelector("#ty").onclick = (e) => { const ch = e.target.closest(".chip"); if (!ch) return; type = ch.dataset.v; el.querySelectorAll("#ty .chip").forEach((x) => x.classList.toggle("on", x === ch)); };
      el.querySelector("#ok").onclick = () => {
        const miss = [["#c", "client"], ["#d", "date"], ["#t", "time"]].find(([q]) => !el.querySelector(q).value);
        if (miss) { toast(`Please choose the ${miss[1]}`); return el.querySelector(miss[0]).focus(); }   // stay open, keep what was typed
        close({ ...a, clientId: el.querySelector("#c").value, date: el.querySelector("#d").value, time: el.querySelector("#t").value,
        duration: +el.querySelector("#m").value || 30, type, notes: el.querySelector("#n").value.trim() }); };
      el.querySelector("#del")?.addEventListener("click", () => close("delete"));
    },
  });
  if (!r) return null;
  if (r === "delete") {
    if (!(await confirmBox("Delete appointment?", "The calendar reminder is removed too."))) return null;
    try { await removeReminder(a.eventId); } catch {}
    await store.deleteAppointment(a.id); toast("Appointment deleted"); return null;
  }
  if (!r.clientId || !r.date || !r.time) { toast("Client, date and time are required"); return null; }
  const saved = await store.upsertAppointment(r);
  const client = store.client(saved.clientId);
  try {
    const id = await pushReminder(appointmentReminder(saved, client), saved.eventId);
    if (id) { saved.eventId = id; await store.upsertAppointment(saved); toast("Saved and added to Google Calendar"); }
    else {
      const ok = await modal(String(html`<h2>Appointment saved</h2><p class="muted">Add it to your phone's calendar to get an alert?</p>
        <div class="actions"><button class="btn ghost" data-close="">No thanks</button><button class="btn teal" data-close="ics">${icon("calendar")} Calendar file</button></div>`));
      if (ok === "ics") downloadFiles([icsFile(appointmentReminder(saved, client))]);
    }
  } catch (e) { toast("Saved, but the calendar update failed: " + e.message, 4500); }
  return saved;
}

export default function appointments(ctx) {
  ctx.title("Calendar");
  let showPast = false;
  const v = ctx.view();
  const draw = () => {
    const t = todayIso();
    const list = store.data.appointments.filter((a) => (showPast ? a.date < t : a.date >= t))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) * (showPast ? -1 : 1));
    const groups = {};
    list.forEach((a) => (groups[a.date] ||= []).push(a));
    v.innerHTML = String(html`
      <div class="seg" id="tab" style="margin-bottom:12px"><button data-v="up" class="${showPast ? "" : "on"}">Upcoming</button><button data-v="past" class="${showPast ? "on" : ""}">Past</button></div>
      ${!store.data.clients.length ? html`<div class="card empty">Add a client first, then book appointments.</div>`
        : Object.keys(groups).length ? Object.entries(groups).map(([d, items]) => html`
        <div class="section-title"><h2>${d === t ? "Today" : fmtDate(d, { weekday: true, year: true })}</h2></div>
        <div class="card"><div class="list">${items.map((a) => { const c = store.client(a.clientId); return html`
          <div class="list-item">
            <div class="avatar" style="background:${avatarColor(c?.name || "")}">${initials(c?.name)}</div>
            <a class="grow" href="#/client/${a.clientId}" style="text-decoration:none;color:inherit"><b>${c?.name || "Client removed"}</b>
              <div class="small muted">${to12(a.time)} · ${a.type}${a.notes ? " · " + a.notes : ""}${a.eventId ? " · in Google Calendar" : ""}</div></a>
            ${c?.phone ? html`<a class="icon-btn" href="${waLink(c.phone, appointmentMessage(a, c), c.phoneCode)}" target="_blank" rel="noopener" aria-label="WhatsApp reminder">${icon("whatsapp")}</a>` : ""}
            <button class="icon-btn" data-ics="${a.id}" aria-label="Calendar file">${icon("bell")}</button>
            <button class="icon-btn" data-edit="${a.id}" aria-label="Edit">${icon("edit")}</button>
          </div>`; })}</div></div>`)
        : html`<div class="card empty">${icon("calendar")}<div>${showPast ? "No past appointments." : "No upcoming appointments."}</div></div>`}
      ${store.data.clients.length ? html`<button class="btn fab" id="add">${icon("plus")} Appointment</button>` : ""}`);
  };
  v.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.parentElement.id === "tab") { showPast = b.dataset.v === "past"; return draw(); }
    if (b.id === "add") { await appointmentModal({}); return draw(); }
    if (b.dataset.edit) { await appointmentModal(store.data.appointments.find((a) => a.id === b.dataset.edit)); return draw(); }
    if (b.dataset.ics) { const a = store.data.appointments.find((x) => x.id === b.dataset.ics); downloadFiles([icsFile(appointmentReminder(a, store.client(a.clientId)))]); }
  });
  draw();
}
