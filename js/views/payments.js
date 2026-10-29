// Payments: lives inside the Clients tab ("Payments" filter) – never on the client's diet page or in diet PDFs.
// client.packages = what was sold (name, fee, start), client.payments = money received (date, amount, mode, receipt no).
import { store, normText, todayIso, uid } from "../store.js";
import { html, icon, toast, modal, confirmBox, fmtDate, initials, avatarColor } from "../ui.js";
import { paymentSummary, receiptFigures } from "../model.js";
import { openReceiptExport, openInvoiceExport } from "./exportDialog.js";
import { local } from "../store.js";

const inr = (n) => DietRender.inr(n);
const monthKey = (iso) => String(iso || "").slice(0, 7);

// ---------- list inside the Clients tab ----------
export function paymentsPanel(rows, sub, searching) {
  const all = rows.map((c) => ({ c, s: paymentSummary(c) }));
  const thisMonth = monthKey(todayIso());
  // totals follow the search: with a search typed they cover the clients shown
  const received = rows.flatMap((c) => c.payments || []).filter((p) => monthKey(p.date) === thisMonth).reduce((n, p) => n + +p.amount, 0);
  const totalDue = all.reduce((n, x) => n + x.s.due, 0);
  const dueCount = all.filter((x) => x.s.due > 0).length;
  let list;
  if (sub === "recent") {
    const pays = all.flatMap(({ c }) => (c.payments || []).map((p) => ({ c, p }))).sort((a, b) => b.p.date.localeCompare(a.p.date) || String(b.p.at || "").localeCompare(String(a.p.at || ""))).slice(0, 60);
    list = pays.length ? html`${pays.map(({ c, p }) => html`<a class="list-item" href="#/payments/${c.id}">
        <div class="avatar" style="background:${avatarColor(c.name)}">${initials(c.name)}</div>
        <div class="grow"><b>${c.name}</b><div class="small muted">${fmtDate(p.date, { year: true })} · ${p.mode || ""}${p.receiptNo ? ` · ${p.receiptNo}` : ""}</div></div>
        <b style="color:var(--green)">${inr(p.amount)}</b></a>`)}` : html`<div class="empty">${icon("check")}<div>No payments recorded yet.</div></div>`;
  } else {
    const shown = all.filter(({ s }) => (sub === "due" ? s.due > 0 : s.packages.length || s.payments.length))
      .sort((a, b) => (sub === "due" ? b.s.due - a.s.due : 0) || a.c.name.localeCompare(b.c.name));
    const noPkg = all.filter(({ s }) => !s.packages.length && !s.payments.length);
    list = html`${shown.length ? shown.map(({ c, s }) => html`<a class="list-item" href="#/payments/${c.id}">
        <div class="avatar" style="background:${avatarColor(c.name)}">${initials(c.name)}</div>
        <div class="grow"><b>${c.name}</b><div class="small muted">${[c.code, s.fee && `Fee ${inr(s.fee)}`, `Paid ${inr(s.paid)}`].filter(Boolean).join(" · ")}</div></div>
        ${s.due > 0 ? html`<span class="badge red">Due ${inr(s.due)}</span>` : s.fee ? html`<span class="badge green">Paid</span>` : html`<span class="badge">No fee set</span>`}</a>`)
      : html`<div class="empty">${icon("check")}<div>${sub === "due" ? "Nobody owes anything." : "No payments recorded yet."}</div></div>`}
      ${sub === "all" && noPkg.length ? html`<details class="more" style="margin-top:8px"><summary class="small muted">Clients without a fee yet (${noPkg.length})</summary>
        ${noPkg.map(({ c }) => html`<a class="list-item" href="#/payments/${c.id}"><div class="avatar" style="background:${avatarColor(c.name)}">${initials(c.name)}</div>
          <div class="grow"><b>${c.name}</b><div class="small muted">${c.code || ""}</div></div><span class="small" style="color:var(--teal)">+ Add fee</span></a>`)}</details>` : ""}`;
  }
  return html`
    <div class="pay-sum">
      <div class="card stat"><div class="tiny muted">RECEIVED THIS MONTH</div><div style="font-size:22px;font-weight:600;color:var(--green)">${inr(received)}</div></div>
      <div class="card stat"><div class="tiny muted">TOTAL DUE</div><div style="font-size:22px;font-weight:600;color:${totalDue ? "var(--coral)" : "var(--navy)"}">${inr(totalDue)}</div><div class="tiny muted">${dueCount} client${dueCount === 1 ? "" : "s"}${searching ? " · matching search" : ""}</div></div></div>
    <div class="seg" id="paySub" style="margin-bottom:12px">${[["due", "Due"], ["all", "All"], ["recent", "Recent payments"]].map(([k, l]) => html`<button data-p="${k}" class="${k === sub ? "on" : ""}">${l}</button>`)}</div>
    <div class="card"><div class="list">${list}</div></div>`;
}

// ---------- one client's payments ----------
export default function clientPayments(ctx, id) {
  const c0 = store.client(id);
  if (!c0) { toast("That client was deleted"); ctx.goReplace("#/clients"); return; }
  ctx.back("#/clients");
  const v = ctx.view();
  const draw = () => {
    const c = store.client(id); if (!c) return ctx.goReplace("#/clients");
    ctx.title(`Payments · ${c.name}`);
    const s = paymentSummary(c);
    v.innerHTML = String(html`
      <div class="card"><div class="row"><div class="avatar" style="background:${avatarColor(c.name)};width:46px;height:46px">${initials(c.name)}</div>
        <div class="grow"><b>${c.name}</b><div class="small muted">${[c.code, c.phone && `+${c.phoneCode || "91"} ${c.phone}`].filter(Boolean).join(" · ")}</div></div></div>
        <div class="pay-tiles">
          <div class="mini-stat"><div class="tiny muted">FEE</div><b>${inr(s.fee)}</b></div>
          <div class="mini-stat"><div class="tiny muted">PAID</div><b style="color:var(--green)">${inr(s.paid)}</b></div>
          <div class="mini-stat"><div class="tiny muted">${s.extra ? "ADVANCE" : "DUE"}</div><b style="color:${s.due ? "var(--coral)" : "var(--navy)"}">${inr(s.extra || s.due)}</b></div></div></div>

      <div class="card"><div class="card-head"><h2>Packages</h2><button class="btn small ghost" id="addPkg">${icon("plus")} Package</button></div>
        ${s.packages.length ? html`<p class="tiny muted" style="margin:0 0 6px">Payments are counted against the oldest package first.</p><div class="list">${s.packages.map((k) => { return html`<div class="list-item">
          <div class="grow"><b>${k.name || "Package"}</b>${(() => { const iv = (c.invoices || []).filter((x) => x.packageId === k.id).at(-1); return iv ? html`<div class="tiny muted">Last invoice ${iv.no} · ${fmtDate(iv.date)}</div>` : ""; })()}<div class="small muted">${k.start ? (k.end ? `${fmtDate(k.start)} – ${fmtDate(k.end, { year: true })}${k.end < todayIso() ? " (ended)" : ""} · ` : `From ${fmtDate(k.start, { year: true })} · `) : ""}${k.discount?.amount ? html`Fee <s>${inr(k.price)}</s> <b style="color:var(--navy)">${inr(k.fee)}</b> <span class="badge green">${k.discount.type === "pct" ? `${k.discount.value}% off` : `${inr(k.discount.amount)} off`}</span>` : html`Fee ${inr(k.fee)}`} · Paid ${inr(k.paid)}${k.note ? ` · ${k.note}` : ""}</div></div>
          ${k.due <= 0 ? html`<span class="badge green">Paid</span>` : html`<span class="badge red">Due ${inr(k.due)}</span>`}
          <button class="btn small ghost" data-invoice="${k.id}">${icon("file")} Invoice</button>
          <button class="icon-btn" data-editpkg="${k.id}" aria-label="Edit package">${icon("edit")}</button>
          <button class="icon-btn danger" data-delpkg="${k.id}" aria-label="Delete package">${icon("trash")}</button></div>`; })}</div>`
        : html`<p class="small muted">Add the package (e.g. "3-month program", ₹6,000) so the app can show what's due. You can record payments without one too.</p>`}</div>

      <div class="card"><div class="card-head"><h2>Payments received</h2><button class="btn small teal" id="addPay">${icon("plus")} Payment</button></div>
        ${s.payments.length ? html`<div class="list">${s.payments.map((p) => html`<div class="list-item">
          <div class="grow"><b style="color:var(--green)">${inr(p.amount)}</b> <span class="small muted">· ${p.mode || ""}</span>
            <div class="small muted">${fmtDate(p.date, { weekday: true, year: true })}${p.receiptNo ? ` · ${p.receiptNo}` : ""}${p.note ? ` · ${p.note}` : ""}</div></div>
          <button class="btn small ghost" data-receipt="${p.id}">${icon("file")} Receipt</button>
          <button class="icon-btn" data-editpay="${p.id}" aria-label="Edit payment">${icon("edit")}</button>
          <button class="icon-btn danger" data-delpay="${p.id}" aria-label="Delete payment">${icon("trash")}</button></div>`)}</div>`
        : html`<div class="empty small">No payments yet.</div>`}</div>`);
  };

  async function pkgModal(k) {
    const c = store.client(id), names = [...new Set(store.data.clients.flatMap((x) => (x.packages || []).map((p) => p.name)).filter(Boolean))];
    const d0 = k?.discount || {}; let dtype = d0.type === "pct" ? "pct" : "rs";
    const DEF_LINE = "You saved {amount} on this package!";
    const r = await modal(String(html`<h2>${k ? "Edit package" : "Add package"}</h2>
      <div class="form-grid" style="margin-top:10px">
        <label class="field full"><span>Package name</span><input type="text" id="pn" value="${k?.name || ""}" list="pkgNames" placeholder="e.g. 3-month weight loss program">
          <datalist id="pkgNames">${names.map((n) => html`<option value="${n}"></option>`)}</datalist></label>
        <label class="field half"><span>Price (₹)</span><input type="number" id="pf" min="0" step="1" inputmode="numeric" value="${k?.price ?? k?.fee ?? ""}"></label>
        <label class="field half"><span>Start date</span><input type="date" id="ps" value="${k?.start || c.program?.start || todayIso()}"></label>
        <label class="field half"><span>Plan end date</span><input type="date" id="pe" value="${k ? k.end || "" : (c.program?.end ? (DietRender.programInfo(c, todayIso(), [])?.effEnd || c.program.end) : "")}"></label>
        <div class="full"><span class="field-label">Discount (optional)</span>
          <div class="row" style="gap:8px"><div class="seg" id="dt"><button type="button" data-v="rs" class="${dtype === "rs" ? "on" : ""}">₹</button><button type="button" data-v="pct" class="${dtype === "pct" ? "on" : ""}">%</button></div>
            <input type="number" id="dv" min="0" step="1" inputmode="decimal" value="${d0.value || ""}" placeholder="0" style="max-width:120px"></div></div>
        <label class="field full"><span>Discount reason (optional, shown on receipt)</span><input type="text" id="dr" value="${d0.reason || ""}" placeholder="e.g. Festive offer, Referral"></label>
        <div class="full card" id="fin" style="box-shadow:none;background:var(--soft);margin:0;padding:10px 12px"></div>
        <label class="inline-check full"><input type="checkbox" id="sv" ${d0.showSaved ? "checked" : ""}> Show a “you saved” line on receipts</label>
        <label class="field full" id="svWrap" ${d0.showSaved ? "" : "hidden"}><span>Saving line ({amount} = the saving)</span><input type="text" id="svt" value="${d0.savedLine || DEF_LINE}"></label>
        <label class="field full"><span>Note (optional)</span><input type="text" id="pnote" value="${k?.note || ""}"></label></div>
      <div class="actions"><button class="btn ghost" data-close="">Cancel</button><button class="btn teal" id="ok">Save</button></div>`),
      { onMount: (el, close) => {
        const $ = (q) => el.querySelector(q);
        const calc = () => { const price = Math.round(parseFloat($("#pf").value)) || 0, dv = parseFloat($("#dv").value) || 0;
          const off = Math.round(dtype === "pct" ? price * Math.min(dv, 100) / 100 : Math.min(dv, price)); return { price, dv, off, fee: Math.max(0, price - off) }; };
        const show = () => { const x = calc();
          $("#fin").innerHTML = String(x.off > 0 ? html`<div class="small muted">Price <s>${inr(x.price)}</s> − discount ${inr(x.off)}${dtype === "pct" ? ` (${x.dv}%)` : ""}</div><div><b>Final fee ${inr(x.fee)}</b></div>`
            : html`<div><b>Final fee ${inr(x.price)}</b></div>`); };
        $("#dt").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; dtype = b.dataset.v; el.querySelectorAll("#dt button").forEach((y) => y.classList.toggle("on", y === b)); show(); };
        $("#pf").oninput = show; $("#dv").oninput = show;
        $("#sv").onchange = () => { $("#svWrap").hidden = !$("#sv").checked; };
        show(); $("#pn").focus();
        $("#ok").onclick = () => {
          const name = $("#pn").value.trim(), rawP = parseFloat($("#pf").value), x = calc();
          if (!name) { toast("Please enter the package name"); return $("#pn").focus(); }
          if (!(rawP >= 0) || rawP > 10000000) { toast("Please enter the price in rupees"); return $("#pf").focus(); }
          if (rawP !== Math.round(rawP)) { toast("Please enter whole rupees (no paise)"); return $("#pf").focus(); }
          if (x.dv < 0 || (dtype === "pct" && x.dv > 100) || (dtype === "rs" && x.dv > x.price)) { toast(dtype === "pct" ? "Discount must be 0–100%" : "Discount can't be more than the price"); return $("#dv").focus(); }
          const st = $("#ps").value || todayIso(), en = $("#pe").value;
          if (en && en < st) { toast("The end date is before the start date"); return $("#pe").focus(); }
          if (dtype === "rs" && x.dv !== Math.round(x.dv)) { toast("Please enter whole rupees (no paise)"); return $("#dv").focus(); }
          const discount = x.off > 0 ? { type: dtype, value: x.dv, amount: x.off, reason: $("#dr").value.trim(), showSaved: $("#sv").checked, savedLine: $("#svt").value.trim() || DEF_LINE } : null;
          close({ name, price: x.price, fee: x.fee, discount, start: st, end: en || "", note: $("#pnote").value.trim() });
        };
      } });
    if (!r) return;
    const fresh = store.client(id);
    fresh.packages ||= [];
    if (k) Object.assign(fresh.packages.find((x) => x.id === k.id) || {}, r);
    else {
      const np = { id: uid("k-"), at: new Date().toISOString(), ...r };
      if (!fresh.packages.length) for (const p of fresh.payments || []) if (!p.packageId) { p.packageId = np.id; p.packageName = np.name; }   // earlier payments belong to the first package
      fresh.packages.push(np);
    }
    await store.upsertClient(fresh); toast(k ? "Package updated" : "Package added"); draw();
  }

  async function payModal(p) {
    const c = store.client(id), s = paymentSummary(c), modes = store.settingsRO.paymentModes || ["UPI", "Cash", "Bank transfer", "Card"];
    let mode = p?.mode || modes[0];
    const r = await modal(String(html`<h2>${p ? "Edit payment" : "Add payment"}</h2>
      <div class="form-grid" style="margin-top:10px">
        <label class="field half"><span>Amount (₹)</span><input type="number" id="pa" min="1" step="1" inputmode="numeric" value="${p?.amount ?? (s.due || "")}"></label>
        <label class="field half"><span>Date</span><input type="date" id="pd" value="${p?.date || todayIso()}"></label>
        <div class="full"><span class="field-label">Mode</span><div class="seg" id="pm">${modes.map((m) => html`<button type="button" data-v="${m}" class="${m === mode ? "on" : ""}">${m}</button>`)}</div></div>
        ${s.packages.length > 1 ? html`<label class="field full"><span>For package (shown on the receipt)</span><select id="pk">${s.packages.map((k) => html`<option value="${k.id}" ${(p ? p.packageId : s.current?.id) === k.id ? "selected" : ""}>${k.name} (${inr(k.fee)})</option>`)}</select></label>` : ""}
        <label class="field full"><span>Note (optional)</span><input type="text" id="pnote" value="${p?.note || ""}" placeholder="e.g. UPI ref, 2nd instalment"></label></div>
      <div class="actions"><button class="btn ghost" data-close="">Cancel</button><button class="btn line" id="ok">Save</button><button class="btn teal" id="okr">Save & receipt</button></div>`),
      { onMount: (el, close) => {
        el.querySelector("#pa").focus();
        el.querySelector("#pm").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; mode = b.dataset.v; el.querySelectorAll("#pm button").forEach((x) => x.classList.toggle("on", x === b)); };
        const done = (receipt) => {
          const raw = parseFloat(el.querySelector("#pa").value), date = el.querySelector("#pd").value;
          if (!(raw > 0) || raw > 10000000) { toast("Please enter the amount in rupees"); return el.querySelector("#pa").focus(); }
          if (raw !== Math.round(raw)) { toast("Please enter whole rupees (no paise)"); return el.querySelector("#pa").focus(); }
          if (!date) return toast("Please pick the date");
          if (date > todayIso() && !el._futureOk) { el._futureOk = true; return toast("That date is in the future – tap Save again if it's correct", 4000); }
          const sel = el.querySelector("#pk")?.value;
          const packageId = sel || (p ? p.packageId : s.current?.id) || null;   // editing keeps its package unless you pick another
          close({ amount: raw, date, mode, note: el.querySelector("#pnote").value.trim(), packageId, packageName: (s.packages.find((k) => k.id === packageId) || {}).name || p?.packageName || "", receipt });
        };
        el.querySelector("#ok").onclick = () => done(false); el.querySelector("#okr").onclick = () => done(true);
      } });
    if (!r) return;
    const { receipt, ...data } = r;
    const fresh = store.client(id);
    fresh.payments ||= [];
    let saved;
    if (p) { saved = fresh.payments.find((x) => x.id === p.id); Object.assign(saved, data); }
    else { saved = { id: uid("pay-"), at: new Date().toISOString(), receiptNo: store.nextReceiptNo(), ...data }; fresh.payments.push(saved); }
    await store.upsertClient(fresh); toast(p ? "Payment updated" : `Payment saved · ${saved.receiptNo}`); draw();
    if (receipt) openReceipt(saved.id);
  }

  // Invoice: asks the client to pay what is still due on a package (before the first payment or between instalments).
  async function invoiceFor(kid) {
    const c = store.client(id), s = paymentSummary(c), k = s.packages.find((x) => x.id === kid); if (!k) return;
    if (k.due <= 0) return toast("Nothing is due on this package – it's fully paid.", 3500);
    const rc = store.settingsRO.receipt || {}, hasPay = !!(rc.upiId || rc.bank), hasUpi = !!rc.upiId;
    const prefs = local.get("invoicePrefs", { pay: true, qr: true });
    const r = await modal(String(html`<h2>Invoice</h2>
      <p class="small muted">${k.name} · amount due <b>${inr(k.due)}</b>${k.paid ? ` (fee ${inr(k.fee)}, paid ${inr(k.paid)})` : ""}</p>
      <div class="stack" style="margin-top:10px">
        <label class="inline-check"><input type="checkbox" id="ipay" data-nodirty ${hasPay && prefs.pay ? "checked" : ""} ${hasPay ? "" : "disabled"}> Show UPI ID & bank details</label>
        <label class="inline-check"><input type="checkbox" id="iqr" data-nodirty ${hasUpi && prefs.qr ? "checked" : ""} ${hasUpi ? "" : "disabled"}> Show UPI QR code for ${inr(k.due)}</label>
        ${hasPay ? "" : html`<p class="tiny muted" style="margin:0">Add your UPI ID / bank details in Settings → Payments & receipts to show them here.</p>`}
      </div>
      <div class="actions"><button class="btn ghost" data-close="">Cancel</button><button class="btn teal" id="ok">Create invoice</button></div>`),
      { discardCheck: false, onMount: (el, close) => { el.querySelector("#ok").onclick = () => close({ pay: el.querySelector("#ipay").checked, qr: el.querySelector("#iqr").checked }); } });
    if (!r) return;
    local.set("invoicePrefs", { pay: hasPay ? r.pay : prefs.pay, qr: hasUpi ? r.qr : prefs.qr });
    const fresh = store.client(id), no = store.nextInvoiceNo(), date = todayIso();
    fresh.invoices ||= []; fresh.invoices.push({ id: uid("inv-"), no, date, packageId: k.id, amount: k.due, at: new Date().toISOString() });
    await store.upsertClient(fresh); draw();
    const d = k.discount || {}, saving = (+k.price || +k.fee) - +k.fee;
    openInvoiceExport({ client: fresh, invoiceNo: no, date, packageName: k.name, start: k.start, end: k.end, price: +k.price || +k.fee, discount: d.amount ? saving : 0,
      discountPct: d.type === "pct" ? d.value : null, discountReason: d.reason || "", fee: +k.fee, paid: k.paid, due: k.due,
      savedLine: d.amount && d.showSaved ? String(d.savedLine || "").replace(/\{amount\}/g, inr(saving)) : "", showPay: r.pay, showQr: r.qr });
  }

  // Receipt shows the totals as they stood right after this payment.
  function openReceipt(pid) {
    const c = store.client(id), p = (c.payments || []).find((x) => x.id === pid); if (!p) return;
    openReceiptExport({ client: c, payment: p, ...receiptFigures(c, p) });
  }

  v.onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const c = store.client(id);
    if (b.id === "addPkg") return pkgModal(null);
    if (b.id === "addPay") return payModal(null);
    if (b.dataset.editpkg) return pkgModal((c.packages || []).find((k) => k.id === b.dataset.editpkg));
    if (b.dataset.editpay) return payModal((c.payments || []).find((k) => k.id === b.dataset.editpay));
    if (b.dataset.receipt) return openReceipt(b.dataset.receipt);
    if (b.dataset.invoice) return invoiceFor(b.dataset.invoice);
    if (b.dataset.delpkg) {
      const k = c.packages.find((x) => x.id === b.dataset.delpkg);
      if (!(await confirmBox("Delete package?", `“${k.name}” (${inr(k.fee)}) will be removed. Payments already recorded are kept and count towards the other packages. It goes to the Recycle bin (Settings) for 30 days.`))) return;
      const fresh = store.client(id); store.toTrash("package", k, { clientId: id, clientName: fresh.name });
      fresh.packages = fresh.packages.filter((x) => x.id !== k.id); await store.upsertClient(fresh); toast("Package deleted"); return draw();
    }
    if (b.dataset.delpay) {
      const p = c.payments.find((x) => x.id === b.dataset.delpay);
      if (!(await confirmBox("Delete payment?", `${inr(p.amount)} on ${fmtDate(p.date, { year: true })}${p.receiptNo ? ` (${p.receiptNo})` : ""} will be removed. It goes to the Recycle bin (Settings) for 30 days.`))) return;
      const fresh = store.client(id); store.toTrash("payment", p, { clientId: id, clientName: fresh.name });
      fresh.payments = fresh.payments.filter((x) => x.id !== p.id); await store.upsertClient(fresh); toast("Payment deleted"); return draw();
    }
  };
  draw();
}
