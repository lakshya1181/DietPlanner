// Client list with search and plan status.
import { store, normText, local } from "../store.js";
import { html, icon, initials, avatarColor } from "../ui.js";
import { clientStatus, clientMetrics } from "../model.js";

export default function clients(ctx) {
  ctx.title("Clients");
  let q = local.get("clientSearch", ""), filter = local.get("clientFilter", "all");   // remembered like the search
  const v = ctx.view();
  v.innerHTML = String(html`
    <div class="row" style="margin-bottom:12px"><input type="search" id="q" placeholder="Search name, phone, email or Client ID" value="${q}" class="grow"></div>
    <div class="seg" id="filters" style="margin-bottom:12px">
      ${[["all", "All"], ["active", "Active"], ["attention", "Needs plan"], ["hold", "On hold"], ["none", "No plan"]].map(([k, l]) => html`<button data-f="${k}" class="${k === filter ? "on" : ""}">${l}</button>`)}
    </div>
    <div class="card"><div class="list" id="list"></div></div>
    <a class="btn fab" href="#/clients/new">${icon("plus")} New client</a>`);
  const draw = () => {
    const n = normText(q);
    // phone search ignores spaces, dashes, "+91" and a leading 0: "98765 43210", "+91 9876543210" all match
    let qd = q.replace(/\D/g, ""); const digitsOnly = /^[\d\s+()-]+$/.test(q.trim());
    const phoneHit = (c) => { if (!digitsOnly || qd.length < 3) return false; const pd = String(c.phone || "").replace(/\D/g, ""), cc = String(c.phoneCode || "91");
      const qq = qd.length > pd.length && qd.startsWith(cc) ? qd.slice(cc.length) : qd.replace(/^0(?=\d{10}$)/, "");
      return !!pd && (pd.includes(qq) || (cc + pd).includes(qd)); };
    const rows = store.data.clients
      .map((c) => ({ c, s: clientStatus(c), m: clientMetrics(c) }))
      .filter(({ c }) => !n || normText(c.name).includes(n) || phoneHit(c) || normText(c.code).includes(n) || String(c.email || "").includes(n))
      .filter(({ s }) => filter === "all" || (filter === "active" && ["active", "ending", "upcoming"].includes(s.key))
        || (filter === "attention" && ["ending", "ended"].includes(s.key)) || (filter === "none" && s.key === "none") || (filter === "hold" && s.key === "hold"))
      .sort((a, b) => a.c.name.localeCompare(b.c.name));
    v.querySelector("#list").innerHTML = rows.length ? String(html`${rows.map(({ c, s, m }) => html`
      <a class="list-item" href="#/client/${c.id}">
        <div class="avatar" style="background:${avatarColor(c.name)}">${initials(c.name)}</div>
        <div class="grow"><b>${c.name}</b>
          <div class="small muted">${[c.code, c.age && `${c.age} yrs`, m.cur && `${m.cur.kg} kg`, m.lost > 0 && `−${m.lost} kg`].filter(Boolean).join(" · ")}</div></div>
        <span class="badge ${s.cls}">${s.label}</span></a>`)}`)
      : String(html`<div class="empty">${icon("users")}<div>${store.data.clients.length ? "No clients match." : "No clients yet. Tap “New client” to add one."}</div></div>`);
  };
  v.querySelector("#q").addEventListener("input", (e) => { q = e.target.value; local.set("clientSearch", q); draw(); });
  v.querySelector("#filters").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return; filter = b.dataset.f; local.set("clientFilter", filter);
    v.querySelectorAll("#filters button").forEach((x) => x.classList.toggle("on", x === b)); draw();
  });
  draw();
}
