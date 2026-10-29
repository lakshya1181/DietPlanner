// PDF / PNG generation in the browser.
//  PDF: pdfmake (real text).  PNG: a one-page "meal table only" PDF rendered by pdf.js,
//  so the PNG and the PDF table come from the same layout engine.
import { store } from "./store.js";

// Poppins with Latin + Hindi (Devanagari) + ₹, and a small symbol font for ✓ → ★ etc. (see render.js withFonts)
let fontsReady = null;

const toB64 = (buf) => { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const waitFor = (test, ms = 15000) => new Promise((res, rej) => { const t0 = Date.now(); (function poll() { if (test()) return res(); if (Date.now() - t0 > ms) return rej(new Error("Export library failed to load")); setTimeout(poll, 50); })(); });

async function ensureFonts() {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    await waitFor(() => window.pdfMake && window.DietRender);
    const vfs = {};
    const fonts = {};
    for (const [name, set] of [["Poppins", DietRender.FONT_FILES.main], ["Sym", DietRender.FONT_FILES.sym]]) {
      for (const w of [400, 600]) vfs[set[w]] = toB64(await (await fetch("assets/fonts/" + set[w])).arrayBuffer());
      fonts[name] = { normal: set[400], bold: set[600], italics: set[400], bolditalics: set[600] };
    }
    pdfMake.vfs = vfs;
    pdfMake.fonts = fonts;
  })();
  try { return await fontsReady; } catch (e) { fontsReady = null; throw e; }
}

async function brandImages(settings) {
  let url = settings.branding.logoDataUrl;
  if (!url) {
    const blob = await (await fetch("assets/logo.png")).blob();
    url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  }
  const img = new Image(); img.src = url; await img.decode();
  return { logo: url, logoAspect: img.naturalHeight / img.naturalWidth };
}

// pdfmake reads settings.branding.watermarkImage only in Node; in the browser images come from brandImages().
const pdfBuffer = (dd) => new Promise((res, rej) => { try { pdfMake.createPdf(dd).getBuffer((b) => res(b)); } catch (e) { rej(e); } });

async function pdfToPng(buf, dpi) {
  await waitFor(() => window.pdfjsLib);
  pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise; // copy: pdf.js transfers (detaches) the buffer
  const page = await doc.getPage(1);
  // Phones (iPhone especially) refuse canvases above ~16 million pixels: lower the resolution for very long tables.
  const v1 = page.getViewport({ scale: 1 });
  const scale = Math.min(dpi / 72, Math.sqrt(16e6 / (v1.width * v1.height)));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  doc.destroy();
  canvas.width = canvas.height = 0;   // free memory
  if (!blob) throw new Error("This meal table is too large to turn into an image on this device. Try the PDF.");
  return blob;
}
async function pageInfo(buf) {
  await waitFor(() => window.pdfjsLib);
  pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const p = await doc.getPage(1); const h = p.view[3] - p.view[1]; const n = doc.numPages; doc.destroy();
  return { height: h, pages: n };
}

// Long meal text: shrink the table text step by step (down to ~74%) so the table stays on one PDF page.
// If it still doesn't fit, the table continues on the next page; a meal row is never split in half.
async function fitTableToPage(client, plan, settings, images) {
  for (const scale of [1, 0.94, 0.88, 0.82, 0.78, 0.74]) {
    const p = { ...plan, _fit: { scale } };
    const info = await pageInfo(await pdfBuffer(DietRender.buildTableFitDoc(client, p, settings, images)));
    if (info.pages === 1) return p;
  }
  // Still too long: whole rows continue on the next page (header repeats). Only if a single meal row is taller
  // than a whole page (it would otherwise vanish) do we let rows split across pages.
  const p = { ...plan, _fit: { scale: 0.74 } };
  const text = await pdfText(await pdfBuffer(DietRender.buildTableFitDoc(client, { ...p, _fit: { scale: 0.74, probe: true } }, settings, images)));
  const flat = text.replace(/\s+/g, "");
  const shown = DietRender.resolveSlots(p, settings).filter((sl) => { const m = (plan.meals || {})[sl.id] || {}; return sl.mode === "shared" ? !!m.shared : (m.days || []).slice(0, plan.days).some(Boolean); });
  // Each row carries an invisible marker; a missing marker means pdfmake dropped that row (taller than a page).
  const missing = shown.some((sl) => !flat.includes(`QZX${sl.id.replace(/[^A-Za-z0-9]/g, "")}QZX`));
  return missing ? { ...p, _fit: { scale: 0.74, allowRowBreak: true } } : p;
}

async function pdfText(buf) {
  await waitFor(() => window.pdfjsLib);
  pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) out += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ") + "\n";
  doc.destroy();
  return out;
}

const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();

/** kinds: ["pdf"] | ["png"] | ["pdf","png"]  → File[] */
export async function buildFiles(client, plan, kinds, settings = store.settings) {
  await ensureFonts();
  const images = await brandImages(settings);
  const base = safeName(DietRender.fileBaseName(client, plan));
  const files = [], missing = [];
  if (kinds.includes("pdf")) {
    let fitted = await fitTableToPage(client, plan, settings, images);
    for (const compact of [0, 1, 2]) {   // keep the cover on one page: tighter layout if needed
      fitted = { ...fitted, _cover: { compact } };
      if ((await pageInfo(await pdfBuffer(DietRender.buildCoverFitDoc(client, fitted, settings, images)))).pages === 1) break;
    }
    const dd = DietRender.buildPlanDoc(client, fitted, settings, images); missing.push(...dd._missing);
    const buf = await pdfBuffer(dd);
    files.push(new File([buf], base + ".pdf", { type: "application/pdf" }));
  }
  if (kinds.includes("png")) {
    // pass 1: auto height (measure); pass 2+: fixed height, grow until it fits one page
    let info = await pageInfo(await pdfBuffer(DietRender.buildTableDoc(client, plan, settings, images)));
    let h = info.height, buf;
    for (let i = 0; i < 40; i++) {
      buf = await pdfBuffer(DietRender.buildTableDoc(client, plan, settings, images, h));
      info = await pageInfo(buf);
      if (info.pages === 1) break;
      h += Math.max(12, h * 0.04);   // grow until the whole table is on one image
    }
    const png = await pdfToPng(buf, 200);
    files.push(new File([png], base + " - Meal Table.png", { type: "image/png" }));
    missing.push(...DietRender.buildTableDoc(client, plan, settings, images)._missing);
  }
  files.missing = [...new Set(missing)];   // letters the PDF fonts can't draw (shown as a note in the export dialog)
  return files;
}

/** One PDF with one page per recipe; client (optional) adds "Prepared for …". */
export async function buildRecipeFile(recipes, client, settings = store.settings) {
  await ensureFonts();
  const images = await brandImages(settings);
  const buf = await pdfBuffer(DietRender.buildRecipeDoc(recipes, settings, images, { client }));
  return new File([buf], safeName(DietRender.recipeFileName(recipes, client)) + ".pdf", { type: "application/pdf" });
}

/** Payment receipt PDF. r = { client, payment, packageName, fee, paidTotal, due } */
export async function buildReceiptFile(r, settings = store.settings) {
  await ensureFonts();
  const images = await brandImages(settings);
  const buf = await pdfBuffer(DietRender.buildReceiptDoc(r, settings, images));
  return new File([buf], safeName(`Receipt ${r.payment.receiptNo || ""} - ${r.client.name}`) + ".pdf", { type: "application/pdf" });
}

/** Invoice PDF (payment request). */
export async function buildInvoiceFile(r, settings = store.settings) {
  await ensureFonts();
  const images = await brandImages(settings);
  const buf = await pdfBuffer(DietRender.buildInvoiceDoc(r, settings, images));
  return new File([buf], safeName(`Invoice ${r.invoiceNo} - ${r.client.name}`) + ".pdf", { type: "application/pdf" });
}

export const canShareFiles = (files) => !!(navigator.canShare && navigator.canShare({ files }));
export async function shareFiles(files, title) { await navigator.share({ files, title }); }
export function downloadFiles(files) {
  files.forEach((f, i) => setTimeout(() => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }, i * 400));
}
export function downloadBlob(blob, name) { downloadFiles([new File([blob], name, { type: blob.type })]); }
