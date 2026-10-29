// Mirrors the local database to one JSON file in Google Drive.
// Conflict rule: each upload bumps `rev`. A device remembers the rev it last synced (baseRev).
//   Drive rev == baseRev  → safe to upload local changes.
//   Drive rev  > baseRev  → someone else saved: take Drive copy if no local edits, else ask the user.
import { store, local } from "./store.js";
import * as G from "./google.js";
import { flushPendingDeletes } from "./reminders.js";

const FILE = "nutriwise-data.json";
let timer = null, running = null, again = false;
const state = { status: "off", last: null, error: null };
const subs = new Set();
const set = (patch) => { Object.assign(state, patch); subs.forEach((f) => f(state)); };
export const syncState = () => state;
export const onSync = (f) => { subs.add(f); return () => subs.delete(f); };

let conflictHandler = async () => "drive";
export const setConflictHandler = (fn) => { conflictHandler = fn; };

async function folderId() {
  const id = await G.driveFolder(window.APP_CONFIG.driveFolderName);
  local.set("driveFolderId", id);
  return id;
}

async function push(folder, fileId, rev) {
  store.data.rev = rev;
  const seq = store.data.meta.changeSeq || 0;   // snapshot point
  // pushedBy lets this device recognise its own upload if the reply was lost (phone network drop). The nonce is
  // saved on this device before the upload, so only the window that really sent it can recognise it.
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.data.meta.lastPush = { nonce, seq, rev };
  await store.commit("sync", { fromSync: true });
  const blob = new Blob([JSON.stringify({ ...store.exportable(), rev, pushedBy: { deviceId: store.data.meta.deviceId, seq, nonce } })], { type: "application/json" });
  const r = await G.driveUpload(FILE, folder, blob, fileId);
  local.set("driveFileId", r.id);
  store.data.meta.baseRev = rev;
  // Anything saved while the upload was running is still unsent: stay "dirty" so it goes up next time.
  store.data.meta.dirty = (store.data.meta.changeSeq || 0) !== seq;
  await store.commit("sync", { fromSync: true });
}

let stopped = false, retryIn = 0;
export function stopAutoSync() { stopped = true; clearTimeout(timer); }
// Plain-language sync errors
function friendly(e) {
  const m = String(e.message || e);
  if (/failed to fetch|network|load failed|offline/i.test(m) || !navigator.onLine) return "no internet connection — will retry automatically";
  if (e.status === 429 || /rate|quota/i.test(m)) return "Google is busy — will retry automatically";
  if (e.status >= 500) return "Google Drive had a problem — will retry automatically";
  return m;
}
export async function syncNow() {
  if (stopped || !store.active) return;
  if (!G.hasToken()) { set({ status: G.wasConnected() ? "needs-auth" : "off" }); return; }
  if (running) { again = true; return running; }
  running = (async () => {
    set({ status: "syncing", error: null });
    try {
      const folder = await folderId();
      const file = await G.driveFind(FILE, folder);
      const meta = store.data.meta;
      if (!file) { await push(folder, null, Math.max(1, (meta.baseRev || 0) + 1)); }
      else {
        const remote = await G.driveReadJson(file.id);
        const rRev = remote.rev || 0;
        const mine = remote.pushedBy && remote.pushedBy.nonce && remote.pushedBy.nonce === meta.lastPush?.nonce && rRev > meta.baseRev;
        if (mine) {   // our own earlier upload arrived even though the reply didn't: just catch up
          meta.baseRev = rRev; store.data.rev = rRev;
          meta.dirty = (meta.changeSeq || 0) !== remote.pushedBy.seq;
          await store.commit("sync", { fromSync: true });
          if (meta.dirty) await push(folder, file.id, rRev + 1);
        }
        else if (rRev === meta.baseRev) { if (meta.dirty) await push(folder, file.id, rRev + 1); }
        else if (!meta.dirty) { await store.replaceAll(remote, { fromSync: true, baseRev: rRev }); }
        else {
          const choice = await conflictHandler(remote);
          if (choice === "device") await push(folder, file.id, rRev + 1);
          else if (choice === "drive") await store.replaceAll(remote, { fromSync: true, baseRev: rRev });
          else throw new Error("Sync paused until you choose which version to keep.");
        }
      }
      set({ status: "ok", last: new Date() }); retryIn = 0;
      try { await flushPendingDeletes(); } catch (e) { console.warn(e); }
    } catch (e) {
      console.error(e);
      set({ status: e.code === "auth" ? "needs-auth" : "error", error: friendly(e) });
      // network / Google trouble: try again by itself (30 s, 1, 2, 4 … up to 10 min); unsent changes stay marked
      if (e.code !== "auth" && !e.saveFailed && !/choose which version/.test(e.message)) {
        retryIn = Math.min(600000, retryIn ? retryIn * 2 : 30000); clearTimeout(timer); timer = setTimeout(syncNow, retryIn);
      }
    } finally {
      running = null;
      // An edit arrived during this sync → run once more so it isn't left behind.
      if ((again || store.data.meta.dirty) && G.hasToken() && state.status === "ok") { again = false; clearTimeout(timer); timer = setTimeout(syncNow, 1500); }
      again = false;
    }
  })();
  return running;
}

export async function connect() {
  await G.signIn();
  await syncNow();
}
export function disconnect() { G.signOut(); set({ status: "off" }); }

// Upload local edits a few seconds after they happen; pull again when the app comes back to the foreground.
export function startAutoSync() {
  store.onChange((reason, fromSync) => {
    if (fromSync) return;
    if (!G.hasToken()) { if (G.wasConnected() && state.status !== "needs-auth") set({ status: "needs-auth" }); return; }  // signed out: say so
    clearTimeout(timer); timer = setTimeout(syncNow, 2500);
  });
  // Google sign-in lasts about an hour; show "Reconnect" as soon as it runs out instead of a stale "Saved".
  setInterval(() => { if (G.wasConnected() && !G.hasToken() && state.status !== "needs-auth") set({ status: "needs-auth" }); }, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && G.hasToken()) syncNow(); });
  window.addEventListener("online", () => { if (G.hasToken()) { retryIn = 0; syncNow(); } });
  set({ status: G.wasConnected() ? "needs-auth" : "off" });
}

// Save exported files to Drive: <App folder>/Exports/<Client name (Client ID)>/ — the ID keeps same-name clients apart
export async function saveExportsToDrive(clientName, files) {
  if (!G.hasToken()) return false;
  const root = await folderId();
  const exp = await G.driveFolder("Exports", root);
  const dir = await G.driveFolder(clientName || "Client", exp);
  for (const f of files) {
    const existing = await G.driveFind(f.name, dir);
    await G.driveUpload(f.name, dir, f, existing?.id);
  }
  return true;
}
