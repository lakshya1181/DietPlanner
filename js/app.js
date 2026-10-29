// App shell: router, navigation, sync banner, install button, service worker.
import { store, local } from "./store.js";
import { $, html, icon, modal, toast, closeAllModals, modalsDirty, anyModalOpen, confirmBox } from "./ui.js";
import * as sync from "./sync.js";
import * as G from "./google.js";
import dashboard from "./views/dashboard.js";
import clients from "./views/clients.js";
import clientView from "./views/client.js";
import clientForm from "./views/clientForm.js";
import planEditor from "./views/plan.js";
import library from "./views/library.js";
import recipeEditor from "./views/recipe.js";
import appointments from "./views/appointments.js";
import settingsView from "./views/settings.js";
import clientPayments from "./views/payments.js";

const NAV = [
  { href: "#/", label: "Today", icon: "home", match: /^#\/?$/ },
  { href: "#/clients", label: "Clients", icon: "users", match: /^#\/(clients|client|plan|payments)/ },
  { href: "#/appointments", label: "Calendar", icon: "calendar", match: /^#\/appointments/ },
  { href: "#/library", label: "Meals", icon: "book", match: /^#\/(library|recipe|template)/ },
  { href: "#/settings", label: "Settings", icon: "settings", match: /^#\/settings/ },
];
const ROUTES = [
  [/^#\/?$/, dashboard],
  [/^#\/clients$/, clients],
  [/^#\/clients\/new$/, clientForm],
  [/^#\/client\/([^/]+)\/edit$/, clientForm],
  [/^#\/client\/([^/]+)$/, clientView],
  [/^#\/plan\/new\/([^/]+)$/, (ctx, cid) => planEditor(ctx, null, cid)],
  [/^#\/plan\/([^/]+)$/, (ctx, pid) => planEditor(ctx, pid)],
  [/^#\/library$/, library],
  [/^#\/recipes$/, (ctx) => library(ctx, "recipes")],
  [/^#\/recipe\/new$/, (ctx) => recipeEditor(ctx, null)],
  [/^#\/recipe\/([^/]+)$/, recipeEditor],
  [/^#\/appointments$/, appointments],
  [/^#\/payments\/([^/]+)$/, clientPayments],
  [/^#\/templates$/, (ctx) => library(ctx, "templates")],
  [/^#\/template\/new$/, (ctx) => planEditor(ctx, null, null, "new")],
  [/^#\/template\/([^/]+)$/, (ctx, id) => planEditor(ctx, null, null, id)],
  [/^#\/settings$/, settingsView],
];

let leaveGuard = null, cleanup = null;
const ctx = {
  view: () => $("#view"),
  title(t) { $("#pageTitle").textContent = t; document.title = `${t} · Diet Planner`; },
  // ‹ goes to the page's parent. If we came straight from there, step back in history (so phone Back stays natural);
  // otherwise (after a save, a delete, or opening a link directly) open the parent page.
  back(href) { const b = $("#backBtn"); b.hidden = !href; b.onclick = () => (href && prevHash === href ? history.back() : ctx.goReplace(href)); },
  actions(h) { $("#topActions").innerHTML = String(h || ""); },
  guard(fn) { leaveGuard = fn; },          // fn() => true if it's OK to leave
  onCleanup(fn) { cleanup = fn; },
  go(hash) { location.hash = hash; },
  // go without leaving the current screen in history (after Save / Delete, Back must not return to a finished form)
  goReplace(hash) { replacing = true; location.replace(hash.startsWith("#") ? hash : "#" + hash); },
  // change the address without reloading the page (router stays in step)
  replace(hash) { history.replaceState({ idx: curIdx }, "", hash); lastHash = hash; },
  refresh() { route(true); },
};

function renderNav() {
  const h = location.hash || "#/";
  const links = NAV.map((n) => html`<a href="${n.href}" class="${n.match.test(h) ? "active" : ""}">${icon(n.icon)}<span>${n.label}</span></a>`);
  $("#nav").innerHTML = String(html`${links}`);
  $("#tabbar").innerHTML = String(html`${links}`);
  $("#brandName").textContent = store.settings.branding.name.split(" ")[0];
}

let lastHash = null, prevHash = null, replacing = false, curIdx = 0;
async function route(force) {
  const h = location.hash || "#/";
  if (!force && h === lastHash) return;
  const stay = !force && ((modalsDirty() && !(await confirmBox("Discard changes?", "What you typed in the open window will be lost.", "Discard")))
    || (leaveGuard && !(await leaveGuard())));
  if (stay) {
    // Stay. If this was Back (we are now on the previous page's entry) put the editor's entry back on top;
    // for a link/tab tap, overwrite the new entry. Either way the page we came from keeps its history entry.
    // Back → re-add our entry on top; replace() → put our address back; a link/tab tap added a new entry → step
    // back off it (no duplicate entry, so ‹ works on the first tap). The hashchange that follows is ignored.
    const toIdx = history.state && history.state.idx;
    if (replacing) history.replaceState({ idx: curIdx }, "", lastHash);
    else if (toIdx != null && toIdx < curIdx) history.go(curIdx - toIdx);   // came Back: go forward to our entry again
    else if (toIdx != null && toIdx > curIdx) history.go(curIdx - toIdx);   // came Forward: go back to it
    else history.back();                                                    // a new entry (link / tab tap): step off it
    replacing = false; return;
  }
  if (!force) { if (!replacing) prevHash = lastHash; replacing = false; }
  // number each history entry, so a cancelled leave can return to exactly the entry we were on
  if (!history.state || history.state.idx == null) history.replaceState({ idx: history.length - 1 }, "");
  curIdx = history.state.idx;
  leaveGuard = null; cleanup?.(); cleanup = null;
  closeAllModals();   // e.g. phone Back button while a dialog is open
  if ($("#updateBanner").textContent.includes("Newer data")) $("#updateBanner").innerHTML = "";
  lastHash = h;
  renderNav();
  ctx.back(null); ctx.actions("");
  const old = $("#view"); const v = old.cloneNode(false); old.replaceWith(v); // fresh element = no stale listeners
  for (const [re, fn] of ROUTES) {
    const m = h.match(re);
    if (m) { try { await fn(ctx, ...m.slice(1).map(decodeURIComponent)); } catch (e) { console.error(e); v.innerHTML = String(html`<div class="card"><h2>Something went wrong</h2><p class="muted">${e.message}</p></div>`); } window.scrollTo(0, 0); return; }
  }
  v.innerHTML = `<div class="empty">Page not found. <a href="#/">Go to Today</a></div>`;
}

// ---------- sync banner ----------
function renderBanner(s) {
  const b = $("#banner");
  const foot = $("#sideFoot");
  const label = { off: "Not connected", "needs-auth": "Tap to reconnect", syncing: "Syncing…", ok: "Saved to Drive", error: "Sync problem" }[s.status];
  foot.innerHTML = G.isConfigured() ? String(html`<button class="btn ghost small block" id="syncBtn">${icon("cloud")} ${label}</button>`) : "";
  foot.querySelector("#syncBtn")?.addEventListener("click", connectOrSync);
  if (s.status === "needs-auth") b.innerHTML = String(html`<div class="banner info">${icon("cloud")}<span class="grow">Google Drive is paused${G.account()?.email ? html` for <b>${G.account().email}</b>` : ""} — your work is saved on this device.</span><button class="btn teal small" id="reconnect">Reconnect</button></div>`);
  else if (s.status === "error") b.innerHTML = String(html`<div class="banner"><span class="grow">Drive sync: ${s.error}</span><button class="btn small" id="reconnect">Retry</button></div>`);
  else b.innerHTML = "";
  b.querySelector("#reconnect")?.addEventListener("click", connectOrSync);
}
export async function connectOrSync() {
  try { if (!G.hasToken()) await sync.connect(); else await sync.syncNow(); if (sync.syncState().status === "ok") toast(`Synced with Google Drive${G.account()?.email ? " · " + G.account().email : ""}`); }
  catch (e) { toast(e.message, 4500); }
}

sync.setConflictHandler((remote) => modal(String(html`
  <h2>Two versions found</h2>
  <p class="muted">Your data was changed on another device <b>and</b> on this one since the last sync. Which version should be kept?</p>
  <p class="small muted">Drive copy saved: ${remote.updatedAt ? new Date(remote.updatedAt).toLocaleString() : "unknown"}<br>This device: ${store.data.updatedAt ? new Date(store.data.updatedAt).toLocaleString() : "unknown"}</p>
  <p class="small muted">Tip: download a backup from Settings first if unsure.</p>
  <div class="actions"><button class="btn ghost" data-close="drive">Keep Drive copy</button><button class="btn" data-close="device">Keep this device</button></div>`), { closeButton: false })); // must pick a version

// Weekly backup question (after a sync). Yes → a dated copy in Drive/Backups.
sync.setBackupAsker(() => anyModalOpen() ? Promise.resolve(null) : modal(String(html`<h2>Weekly backup</h2>
  <p class="muted">Save this week's backup copy of all your data to Google Drive? It lets you go back if something is deleted or changed by mistake.</p>
  <p class="small muted">The last 8 weekly copies are kept. You can also back up any time in Settings.</p>
  <div class="actions"><button class="btn ghost" data-close="no">Not this week</button><button class="btn teal" data-close="yes">Yes, back up</button></div>`),
  { closeButton: false, discardCheck: false, keepOnNavigate: true }).then((v) => { if (v === "yes") toast("Saving backup to Drive…"); return v == null ? null : v === "yes"; }));

// Signed in with a different Gmail than the one this device's data belongs to: the user decides.
sync.setAccountHandler((linked, email) => modal(String(html`
  <h2>Different Google account</h2>
  <p class="muted">The data on this device belongs to <b>${linked}</b>. You signed in as <b>${email}</b>. What should happen?</p>
  ${store.data.meta.dirty ? html`<p class="small" style="color:var(--warn)">Some changes on this device haven't reached ${linked}'s Drive yet. Download a backup first if you choose the first option.</p>` : ""}
  <div class="stack" style="margin-top:10px">
    <button class="choice" data-close="theirs"><span><b>Use ${email}'s data</b><span class="small muted">This device shows ${email}'s clients (empty if that account has none yet). ${linked}'s data stays safe in its own Drive.</span></span></button>
    <button class="choice" data-close="move"><span><b>Copy this device's data to ${email}</b><span class="small muted">The clients on this device are saved into ${email}'s Drive from now on.</span></span></button>
  </div>
  <div class="actions"><button class="btn ghost" id="bk" data-nodirty>${icon("download")} Download backup</button><button class="btn ghost" data-close="cancel">Cancel – stay with ${linked}</button></div>`),
  { closeButton: false, discardCheck: false, onMount: (el) => { el.querySelector("#bk").onclick = () => {
    const blob = new Blob([JSON.stringify(store.exportable())], { type: "application/json" }); const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `nutriwise-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); toast("Backup downloaded"); }; } }));

// ---------- install ----------
let installEvt = null;
export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const canInstall = () => !isStandalone() && (!!installEvt || isIOS());
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; if ((location.hash || "#/") === "#/") ctx.refresh(); });
window.addEventListener("appinstalled", () => { installEvt = null; toast("App installed");
  if (!store._editorDirty && ["#/", "", "#/settings"].includes(location.hash)) ctx.refresh(); });   // never wipe an open editor
export async function installApp() {
  if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; if (!store._editorDirty) ctx.refresh(); return; }
  modal(String(html`<h2>Install on iPhone / iPad</h2>
    <ol class="stack" style="padding-left:20px">
      <li>Open this page in <b>Safari</b>.</li>
      <li>Tap the <b>Share</b> button ${icon("share")} at the bottom of the screen.</li>
      <li>Scroll and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>
    <div class="actions"><button class="btn" data-close="ok">Got it</button></div>`));
}

// ---------- one window at a time (see store.claimTab) ----------
const chan = "BroadcastChannel" in window ? new BroadcastChannel("nutriwise-tabs") : null;
function showBlocked(note) {
  closeAllModals(); leaveGuard = null; cleanup?.(); cleanup = null;
  $("#tabbar").innerHTML = ""; $("#nav").innerHTML = ""; $("#topActions").innerHTML = ""; $("#backBtn").hidden = true; $("#updateBanner").innerHTML = "";
  $("#pageTitle").textContent = "Open in another window";
  $("#view").innerHTML = String(html`<div class="card" style="margin-top:20px"><h2>Diet Planner is open in another window</h2>
    <p class="muted">To keep your data safe, only one tab or window can be used at a time (two open copies would overwrite each other's changes).</p>
    ${note ? html`<p class="small" style="color:var(--warn)">${note}</p>` : ""}
    <button class="btn teal" id="useHere">Use it here</button></div>`);
  $("#useHere").onclick = () => { if (!chan) return location.reload(); $("#useHere").disabled = true; chan.postMessage({ type: "take" });
    setTimeout(() => { const b = $("#useHere"); if (b) b.disabled = false; }, 4000); };
}
// When the working window closes, a waiting window takes over (after a short pause, so a window that is only
// reloading gets its turn back first).
async function takeOverIfFree() {
  await new Promise((r) => setTimeout(r, 1500));
  const q = await navigator.locks?.query?.().catch(() => null);
  if (q && !q.held.some((l) => l.name === "nutriwise-db")) location.reload();
}
window.addEventListener("pagehide", () => { if (store.active) chan?.postMessage({ type: "bye" }); });
chan?.addEventListener("message", (e) => {
  const m = e.data || {};
  if (m.type === "take" && store.active) {
    if ((leaveGuard && store._editorDirty) || modalsDirty()) { chan.postMessage({ type: "busy" }); toast("Another window wants to open the app: save or close what you're editing here first.", 5000); return; }
    sync.stopAutoSync?.(); store.releaseTab(); showBlocked(); chan.postMessage({ type: "released" });
  }
  if ((m.type === "released") && !store.active) location.reload();   // our turn: start with fresh data
  if (m.type === "bye" && !store.active) takeOverIfFree();
  if (m.type === "busy" && !store.active) showBlocked("The other window has unsaved changes. Save them there first, then tap “Use it here” again.");
});

// A failed save: the change is kept in memory, the screen stays "unsaved", and this banner stays until a save works.
function saveErrorBanner() {
  const e = store.saveError; if (!e) return;
  $("#updateBanner").innerHTML = String(html`<div class="banner" style="background:var(--coral-soft);color:var(--coral)"><span class="grow"><b>Not saved on this device:</b> ${e.message || "storage error"}. Free some space on the phone/computer, then tap Save again. Your typing is kept on screen.</span><button class="btn small" id="dlBackup">Backup</button></div>`);
  $("#dlBackup").onclick = () => { const blob = new Blob([JSON.stringify(store.exportable())], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `nutriwise-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); };
}
window.addEventListener("unhandledrejection", (e) => { if (e.reason && e.reason.saveFailed) { e.preventDefault(); saveErrorBanner(); } });

// ---------- light / dark mode (per device) ----------
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const darkQuery = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
export const themePref = () => local.get("theme", "light");   // "light" | "dark" | "auto"
export function applyTheme(pref = themePref()) {
  local.set("theme", pref);
  const dark = pref === "dark" || (pref === "auto" && !!darkQuery?.matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0E131A" : "#1E3A6B");
  const b = $("#themeBtn"); if (b) { b.innerHTML = dark ? SUN : MOON; b.title = b.ariaLabel = dark ? "Switch to light mode" : "Switch to dark mode"; }
}
darkQuery?.addEventListener?.("change", () => { if (themePref() === "auto") applyTheme("auto"); });
document.addEventListener("click", (e) => { if (e.target.closest("#themeBtn")) {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  applyTheme(dark ? "light" : "dark"); toast(dark ? "Light mode" : "Dark mode");
  if (location.hash === "#/settings" && !store._editorDirty) ctx.refresh();
} });
applyTheme();

// ---------- boot ----------
(async function boot() {
  if (!(await store.claimTab())) { await store.load().catch(() => {}); showBlocked(); return; }
  await store.load();
  if (store.loadError) {   // never run on an empty database when saved data couldn't be read
    $("#view").innerHTML = String(html`<div class="card" style="margin-top:20px"><h2>Couldn't open your saved data</h2>
      <p class="muted">The browser didn't allow access to this app's storage (${store.loadError.message || "unknown error"}). Nothing has been changed.</p>
      <ul class="small muted"><li>Close the app or tab completely and open it again.</li><li>Private / incognito windows can't keep data — use a normal window.</li>
      <li>If Google Drive was connected, your data is also safe there.</li></ul>
      <button class="btn teal" onclick="location.reload()">Try again</button></div>`);
    $("#tabbar").innerHTML = ""; $("#nav").innerHTML = "";
    return;
  }
  sync.onSync(renderBanner);
  sync.startAutoSync();
  window.addEventListener("hashchange", () => route());
  window.addEventListener("beforeunload", (e) => { if ((leaveGuard && store._editorDirty) || modalsDirty()) { e.preventDefault(); e.returnValue = ""; } });
  store.onChange((reason, fromSync) => {
    if (reason === "settings") renderNav();
    if (reason === "save-error") saveErrorBanner();
    if (reason === "save-ok" && /Not saved on this device/.test($("#updateBanner").textContent)) { $("#updateBanner").innerHTML = ""; toast("Saved again — all changes are stored"); }
    // Newer data arrived from another device: redraw so no screen keeps (and later saves) an old copy.
    if (reason === "replace" && fromSync) {
      if (store._editorDirty || modalsDirty()) $("#updateBanner").innerHTML = `<div class="banner"><span class="grow">Newer data arrived from your other device. Save or leave this screen to see it.</span></div>`;
      else ctx.refresh();
    }
  });
  await route(true);
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        nw?.addEventListener("statechange", () => { if (nw.state === "installed" && navigator.serviceWorker.controller) {
          $("#updateBanner").innerHTML = `<div class="banner info"><span class="grow">A new version is available.</span><button class="btn teal small" onclick="location.reload()">Update</button></div>`;
        } });
      });
    }).catch(() => {});
  }
})();
