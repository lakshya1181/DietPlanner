// Export dialog: choose PDF / PNG / both → generate → share or download.
import { store, local } from "../store.js";
import { html, icon, modal, toast } from "../ui.js";
import { buildFiles, buildRecipeFile, buildReceiptFile, buildInvoiceFile, canShareFiles, shareFiles, downloadFiles } from "../export.js";
import { saveExportsToDrive } from "../sync.js";
import { renderSettingsFor } from "../model.js";
import * as G from "../google.js";

export function openExport(client, plan, opts = {}) {
  let kinds = local.get("exportKinds", ["pdf", "png"]);
  plan = { ...plan, pdfSections: { ...(plan.pdfSections || {}) } };
  const wOn = () => DietRender.sectionOn(plan, store.settingsRO, "weightRow");
  return modal(String(html`
    <h2>Export plan</h2>
    <p class="small muted">${DietRender.fileBaseName(client, plan)}</p>
    <div class="stack" id="pick" style="margin-top:12px">
      <button class="choice ${kinds.includes("pdf") ? "on" : ""}" data-k="pdf"><span class="big">${icon("file")}</span><span><b>PDF</b><span class="small muted">Full plan: cover, meal table, guidelines</span></span></button>
      <button class="choice ${kinds.includes("png") ? "on" : ""}" data-k="png"><span class="big">${icon("image")}</span><span><b>PNG image</b><span class="small muted">Meal table only, easy to view on WhatsApp</span></span></button>
    </div>
    <label class="card weight-opt" id="wOpt"><input type="checkbox" id="wRow" data-nodirty ${wOn() ? "checked" : ""}>
      <span><b>${icon("scale")} Daily weight row in PDF</b><span class="small muted">The "Weight" row at the bottom of the meal table. Not used in the PNG.</span></span></label>
    <div id="result"></div>
    <div class="actions" id="acts"><button class="btn ghost" data-close="">Cancel</button><button class="btn teal" id="go">Create</button></div>`), { discardCheck: false,   // nothing typed here
    onMount(el, close) {
      const pick = el.querySelector("#pick"), go = el.querySelector("#go");
      const wOpt = el.querySelector("#wOpt");
      el.querySelector("#wRow").addEventListener("change", async (e) => {
        const on = e.target.checked; plan.pdfSections.weightRow = on;
        const stored = store.plan(plan.id); // remember the choice on the saved plan
        if (stored) { try { await store.upsertPlan({ ...stored, pdfSections: { ...(stored.pdfSections || {}), weightRow: on } }); } catch (err) { console.error(err); } }
        opts.onWeightRow?.(on);
      });
      const sync = () => { wOpt.hidden = !kinds.includes("pdf"); go.disabled = !kinds.length; go.textContent = kinds.length === 2 ? "Create both" : kinds.length ? `Create ${kinds[0].toUpperCase()}` : "Choose a format"; };
      pick.addEventListener("click", (e) => {
        const b = e.target.closest(".choice"); if (!b) return;
        b.classList.toggle("on");
        kinds = [...pick.querySelectorAll(".choice.on")].map((x) => x.dataset.k);
        local.set("exportKinds", kinds); sync();
      });
      sync();
      go.addEventListener("click", async () => {
        go.disabled = true; go.innerHTML = `<span class="spinner"></span> Creating…`;
        try {
          const settings = renderSettingsFor(plan);
          const files = await buildFiles(client, plan, kinds, settings);
          let driveNote = "";
          if (store.settings.sync.saveExportsToDrive && G.hasToken()) {
            try { await saveExportsToDrive(client.code ? `${client.name} (${client.code})` : client.name, files); driveNote = "Copy saved to Google Drive."; }
            catch (e) { driveNote = "Could not save a copy to Drive: " + e.message; }
          }
          pick.hidden = true; wOpt.hidden = true;
          const share = canShareFiles(files);
          el.querySelector("#result").innerHTML = String(html`
            <div class="card" style="background:var(--green-soft);box-shadow:none;margin-top:6px">
              <b>${icon("check")} Ready</b>
              <ul class="small" style="margin:6px 0 0;padding-left:18px">${files.map((f) => html`<li>${f.name} <span class="muted">(${Math.round(f.size / 1024)} KB)</span></li>`)}</ul>
              ${driveNote ? html`<p class="small muted" style="margin:6px 0 0">${driveNote}</p>` : ""}
              ${files.missing?.length ? html`<p class="small" style="margin:6px 0 0;color:var(--warn)">Some characters can't be printed and may show as boxes: ${files.missing.slice(0, 8).join(" ")}. English and Hindi are supported.</p>` : ""}
            </div>`);
          // iPhone/iPad allow only one download per tap, so offer one button per file there.
          const oneTap = files.length > 1 && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
          el.querySelector("#acts").innerHTML = String(html`
            ${oneTap ? files.map((f, i) => html`<button class="btn ghost" data-dl="${i}">${icon("download")} ${f.type === "application/pdf" ? "PDF" : "PNG"}</button>`)
              : html`<button class="btn ghost" id="dl">${icon("download")} Download</button>`}
            ${share ? html`<button class="btn teal" id="sh">${icon("share")} Share</button>` : ""}`);
          el.querySelector("#dl")?.addEventListener("click", () => { downloadFiles(files); toast("Downloading…"); });
          el.querySelectorAll("[data-dl]").forEach((b) => b.addEventListener("click", () => { downloadFiles([files[+b.dataset.dl]]); toast("Downloading…"); }));
          el.querySelector("#sh")?.addEventListener("click", async () => {
            try { await shareFiles(files, DietRender.fileBaseName(client, plan)); close("shared"); }
            catch (e) { if (e.name !== "AbortError") toast("Sharing failed: " + e.message, 4000); }
          });
        } catch (e) {
          console.error(e); toast("Export failed: " + e.message, 5000);
          go.disabled = false; sync();
        }
      });
    },
  });
}


// Recipe PDF (one recipe or several as one file); optionally "Prepared for" a client.
export function openRecipeExport(recipes) {
  const empty = recipes.filter((r) => !DietRender.recipeHasContent(r));
  recipes = recipes.filter((r) => DietRender.recipeHasContent(r));
  if (!recipes.length) { toast(`Add ingredients or the method to “${empty[0]?.name || "this recipe"}” first`, 3500); return; }
  if (empty.length) toast(`Left out (nothing to print yet): ${empty.map((r) => r.name).join(", ")}`, 4000);
  const clients = [...store.data.clients].sort((a, b) => a.name.localeCompare(b.name));
  return modal(String(html`
    <h2>Recipe PDF</h2>
    <p class="small muted">${recipes.length === 1 ? recipes[0].name : `${recipes.length} recipes in one PDF, one page each`}</p>
    <label class="field" id="pick" style="margin-top:12px"><span>Prepared for (optional)</span>
      <select id="cl" data-nodirty><option value="">— No client name —</option>${clients.map((c) => html`<option value="${c.id}">${c.name}${c.code ? ` (${c.code})` : ""}</option>`)}</select></label>
    <div id="result"></div>
    <div class="actions" id="acts"><button class="btn ghost" data-close="">Cancel</button><button class="btn teal" id="go">Create PDF</button></div>`), { discardCheck: false,
    onMount(el, close) {
      const go = el.querySelector("#go");
      go.addEventListener("click", async () => {
        go.disabled = true; go.innerHTML = `<span class="spinner"></span> Creating…`;
        try {
          const client = store.client(el.querySelector("#cl").value) || null;
          const file = await buildRecipeFile(recipes, client);
          let driveNote = "";
          if (store.settingsRO.sync.saveExportsToDrive && G.hasToken()) {
            try { await saveExportsToDrive(client ? (client.code ? `${client.name} (${client.code})` : client.name) : "Recipes", [file]); driveNote = "Copy saved to Google Drive."; } catch (e) { driveNote = "Could not save a copy to Drive: " + e.message; }
          }
          el.querySelector("#pick").hidden = true;
          el.querySelector("#result").innerHTML = String(html`<div class="card" style="background:var(--green-soft);box-shadow:none;margin-top:6px">
            <b>${icon("check")} Ready</b><div class="small" style="margin-top:4px">${file.name} <span class="muted">(${Math.round(file.size / 1024)} KB)</span></div>
            ${driveNote ? html`<p class="small muted" style="margin:6px 0 0">${driveNote}</p>` : ""}</div>`);
          const share = canShareFiles([file]);
          el.querySelector("#acts").innerHTML = String(html`<button class="btn ghost" id="dl">${icon("download")} Download</button>
            ${share ? html`<button class="btn teal" id="sh">${icon("share")} Share</button>` : ""}`);
          el.querySelector("#dl").onclick = () => { downloadFiles([file]); toast("Downloading…"); };
          el.querySelector("#sh")?.addEventListener("click", async () => {
            try { await shareFiles([file], file.name); close("shared"); } catch (e) { if (e.name !== "AbortError") toast("Sharing failed: " + e.message, 4000); }
          });
        } catch (e) { console.error(e); toast("Export failed: " + e.message, 5000); go.disabled = false; go.textContent = "Create PDF"; }
      });
    },
  });
}

// Payment receipt PDF: created straight away, then Download / Share (and a copy in Drive if that setting is on).
export function openReceiptExport(r) {
  return modal(String(html`
    <h2>Payment receipt</h2>
    <p class="small muted">${r.payment.receiptNo} · ${r.client.name} · ${DietRender.inr(r.payment.amount)}</p>
    <div id="result"><p class="small muted"><span class="spinner"></span> Creating…</p></div>
    <div class="actions" id="acts"><button class="btn ghost" data-close="">Close</button></div>`), { discardCheck: false,
    async onMount(el, close) {
      try {
        const file = await buildReceiptFile(r);
        let driveNote = "";
        if (store.settingsRO.sync.saveExportsToDrive && G.hasToken()) {
          try { await saveExportsToDrive(r.client.code ? `${r.client.name} (${r.client.code})` : r.client.name, [file]); driveNote = "Copy saved to Google Drive."; } catch (e) { driveNote = "Could not save a copy to Drive: " + e.message; }
        }
        el.querySelector("#result").innerHTML = String(html`<div class="card" style="background:var(--green-soft);box-shadow:none;margin-top:6px">
          <b>${icon("check")} Ready</b><div class="small" style="margin-top:4px">${file.name} <span class="muted">(${Math.round(file.size / 1024)} KB)</span></div>
          ${driveNote ? html`<p class="small muted" style="margin:6px 0 0">${driveNote}</p>` : ""}</div>`);
        const share = canShareFiles([file]);
        el.querySelector("#acts").innerHTML = String(html`<button class="btn ghost" data-close="">Close</button><button class="btn ghost" id="dl">${icon("download")} Download</button>
          ${share ? html`<button class="btn teal" id="sh">${icon("share")} Share</button>` : ""}`);
        el.querySelector("#dl").onclick = () => { downloadFiles([file]); toast("Downloading…"); };
        el.querySelector("#sh")?.addEventListener("click", async () => {
          try { await shareFiles([file], file.name); close("shared"); } catch (e) { if (e.name !== "AbortError") toast("Sharing failed: " + e.message, 4000); }
        });
      } catch (e) { console.error(e); el.querySelector("#result").innerHTML = ""; toast("Receipt failed: " + e.message, 5000); }
    },
  });
}

// Invoice PDF (payment request): created straight away, then Download / Share (and a copy in Drive if that setting is on).
export function openInvoiceExport(r) {
  return modal(String(html`
    <h2>Invoice</h2>
    <p class="small muted">${r.invoiceNo} · ${r.client.name} · ${DietRender.inr(r.due)} due</p>
    <div id="result"><p class="small muted"><span class="spinner"></span> Creating…</p></div>
    <div class="actions" id="acts"><button class="btn ghost" data-close="">Close</button></div>`), { discardCheck: false,
    async onMount(el, close) {
      try {
        const file = await buildInvoiceFile(r);
        let driveNote = "";
        if (store.settingsRO.sync.saveExportsToDrive && G.hasToken()) {
          try { await saveExportsToDrive(r.client.code ? `${r.client.name} (${r.client.code})` : r.client.name, [file]); driveNote = "Copy saved to Google Drive."; } catch (e) { driveNote = "Could not save a copy to Drive: " + e.message; }
        }
        el.querySelector("#result").innerHTML = String(html`<div class="card" style="background:var(--green-soft);box-shadow:none;margin-top:6px">
          <b>${icon("check")} Ready</b><div class="small" style="margin-top:4px">${file.name} <span class="muted">(${Math.round(file.size / 1024)} KB)</span></div>
          ${driveNote ? html`<p class="small muted" style="margin:6px 0 0">${driveNote}</p>` : ""}</div>`);
        const share = canShareFiles([file]);
        el.querySelector("#acts").innerHTML = String(html`<button class="btn ghost" data-close="">Close</button><button class="btn ghost" id="dl">${icon("download")} Download</button>
          ${share ? html`<button class="btn teal" id="sh">${icon("share")} Share</button>` : ""}`);
        el.querySelector("#dl").onclick = () => { downloadFiles([file]); toast("Downloading…"); };
        el.querySelector("#sh")?.addEventListener("click", async () => {
          try { await shareFiles([file], file.name); close("shared"); } catch (e) { if (e.name !== "AbortError") toast("Sharing failed: " + e.message, 4000); }
        });
      } catch (e) { console.error(e); el.querySelector("#result").innerHTML = ""; toast("Invoice failed: " + e.message, 5000); }
    },
  });
}
