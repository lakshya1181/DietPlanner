// "Today": appointments, plans needing attention, quick actions.
import { store, todayIso } from "../store.js";
import { html, icon, fmtDate, to12, addDaysIso, initials, avatarColor } from "../ui.js";
import { clientStatus } from "../model.js";
import { canInstall, installApp, isIOS, isStandalone } from "../app.js";
import * as G from "../google.js";

export default function dashboard(ctx) {
  ctx.title("Today");
  const t = todayIso(), tmr = addDaysIso(t, 1);
  const appts = store.data.appointments.filter((a) => a.date === t || a.date === tmr).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const statuses = store.data.clients.map((c) => ({ c, s: clientStatus(c) }));
  const attention = statuses.filter((x) => x.s.key === "ending" || x.s.key === "ended").sort((a, b) => (a.s.key === "ending" ? -1 : 1));
  const active = statuses.filter((x) => x.s.key === "active" || x.s.key === "ending").length;
  const noPlan = statuses.filter((x) => x.s.key === "none");
  const onHold = statuses.filter((x) => x.s.key === "hold");

  const apptRow = (a) => { const c = store.client(a.clientId); return html`
    <a class="list-item" href="#/client/${a.clientId}">
      <div class="avatar" style="background:${avatarColor(c?.name || "")}">${initials(c?.name)}</div>
      <div class="grow"><b>${c?.name || "Client"}</b><div class="small muted">${a.type || "Appointment"}${a.notes ? " · " + a.notes : ""}</div></div>
      <div style="text-align:right"><b>${to12(a.time)}</b><div class="tiny muted">${a.date === t ? "Today" : "Tomorrow"}</div></div></a>`; };
  const clientRow = ({ c, s }) => html`
    <a class="list-item" href="#/client/${c.id}">
      <div class="avatar" style="background:${avatarColor(c.name)}">${initials(c.name)}</div>
      <div class="grow"><b>${c.name}</b><div class="small muted">${s.plan ? `Last plan: ${fmtDate(s.plan.startDate)}` : "No plans yet"}</div></div>
      <span class="badge ${s.cls}">${s.label}</span></a>`;

  ctx.view().innerHTML = String(html`
    <p class="muted" style="margin:0 2px 14px">${fmtDate(t, { weekday: true, year: true })}</p>
    ${canInstall() ? html`<div class="card row" style="background:var(--teal-soft)">
        <div class="grow"><b>Install the app</b><div class="small muted">Open it from your home screen like any other app.</div></div>
        <button class="btn teal small" id="installBtn">${icon("install")} Install</button></div>` : ""}
    ${isIOS() && !isStandalone() && !G.wasConnected() ? html`<div class="card row" style="background:var(--coral-soft)">
        <div class="grow"><b>Keep your data safe on iPhone</b><div class="small muted">Safari may clear data of websites not used for 7 days. Install the app (Share → Add to Home Screen) or connect Google Drive.</div></div></div>` : ""}
    ${!G.isConfigured() ? html`<div class="card row" style="background:var(--amber-soft)">
        <div class="grow"><b>Data is saved on this device only</b><div class="small muted">Connect Google Drive in Settings to sync between phone and laptop.</div></div>
        <a class="btn small" href="#/settings">Set up</a></div>` : ""}
    <div class="kpi-row" style="margin-top:14px">
      <div class="kpi"><div class="v">${store.data.clients.length}</div><div class="s">Clients</div></div>
      <div class="kpi"><div class="v">${active}</div><div class="s">Active plans</div></div>
      <div class="kpi"><div class="v" style="color:${attention.length ? "var(--coral)" : ""}">${attention.length}</div><div class="s">Need a plan</div></div>
    </div>
    <div class="section-title"><h2>Appointments</h2><a class="small" href="#/appointments">All</a></div>
    <div class="card">${appts.length ? html`<div class="list">${appts.map(apptRow)}</div>`
      : html`<div class="empty small">${icon("calendar")}<div>No appointments today or tomorrow.</div></div>`}</div>
    <div class="section-title"><h2>Needs a new plan</h2></div>
    <div class="card">${attention.length ? html`<div class="list">${attention.map(clientRow)}</div>`
      : html`<div class="empty small">${icon("check")}<div>All clients have a current plan.</div></div>`}</div>
    ${onHold.length ? html`<div class="section-title"><h2>On hold</h2></div><div class="card"><div class="list">${onHold.map(clientRow)}</div></div>` : ""}
    ${noPlan.length ? html`<div class="section-title"><h2>New clients without a plan</h2></div><div class="card"><div class="list">${noPlan.slice(0, 6).map(clientRow)}</div></div>` : ""}
    <a class="btn fab" href="#/clients/new">${icon("plus")} New client</a>`);
  ctx.view().querySelector("#installBtn")?.addEventListener("click", installApp);
}
