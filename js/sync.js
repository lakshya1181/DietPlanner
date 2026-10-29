// Mirrors the local database to one JSON file in Google Drive.
// Conflict rule: each upload bumps `rev`. A device remembers the rev it last synced (baseRev).
//   Drive rev == baseRev  → safe to upload local changes.
//   Drive rev  > baseRev  → someone else saved: take Drive copy if no local edits, else ask the user.
import { store, local, todayIso } from "./store.js";
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
  // compressed when the browser can (old app versions can't read it and simply stop with an error — they never overwrite it)
  const blob = await G.packJson({ ...store.exportable(), rev, pushedBy: { deviceId: store.data.meta.deviceId, seq, nonce } });
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
      setTimeout(() => { if (state.status === "ok") maybeAskBackup(); }, 1500);
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

// The device's data is linked to one Google account (meta.driveAccount). Signing in with a DIFFERENT Gmail
// never mixes two people's data silently: the user chooses what happens (see setAccountHandler in app.js).
let accountHandler = async () => "cancel";
export const setAccountHandler = (fn) => { accountHandler = fn; };

async function linkAccount() {
  let acc;
  try { acc = await G.fetchAccount(); } catch (e) { if (e.code === "auth") throw e; acc = G.account() || {}; }
  const meta = store.data.meta, linked = meta.driveAccount;
  if (acc.email && linked && linked !== acc.email) {
    const choice = await accountHandler(linked, acc.email);
    if (choice === "theirs") {            // this device switches to the other account's data
      local.set("driveFolderId", null); local.set("driveFileId", null);
      const folder = await folderId(), file = await G.driveFind(FILE, folder);
      if (file) { const remote = await G.driveReadJson(file.id); await store.replaceAll(remote, { fromSync: true, baseRev: remote.rev || 0 }); }
      else await store.replaceAll({ clients: [], settings: store.data.settings }, { fromSync: true, baseRev: 0 });   // new account: start empty, keep your Settings
    } else if (choice === "move") {       // copy this device's data into the other account's Drive
      local.set("driveFolderId", null); local.set("driveFileId", null);
      meta.baseRev = 0; meta.dirty = true; meta.lastPush = null;
    } else {                              // cancel: stay with the old account, sign this one out
      G.signOut({ revoke: false }); local.set("googleAccount", { email: linked }); local.set("googleConnected", true); set({ status: "needs-auth" });
      throw Object.assign(new Error("Switch cancelled. This device stays linked to " + linked + "."), { cancelled: true });
    }
  }
  if (acc.email) { store.data.meta.driveAccount = acc.email; await store.commit("account", { fromSync: true }); }
  return acc;
}
export async function connect() {
  stopped = false;
  await G.signIn();
  await linkAccount();
  await syncNow();
}
// Choose another Gmail: shows Google's account picker; the data choice is asked in linkAccount.
export async function switchAccount() {
  stopped = false;
  const prev = G.account();
  G.signOut({ revoke: false });
  try { await G.signIn({ prompt: "select_account", hint: null }); }
  catch (e) { if (prev) local.set("googleAccount", prev); throw e; }
  await linkAccount();
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
  // still signed in from earlier (within Google's hour): just sync; otherwise show Reconnect / Not connected
  if (G.hasToken()) setTimeout(syncNow, 500); else set({ status: G.wasConnected() ? "needs-auth" : "off" });
}

// ---------- weekly backups in Drive: <App folder>/Backups/backup-YYYY-MM-DD.json.gz (last 8 kept) ----------
const KEEP = 8, KEEP_SAFETY = 3;
export const weekKey = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
async function backupsFolder() { return G.driveFolder("Backups", await folderId()); }
// kind "" = normal weekly/manual backup, "before-restore" = safety copy made automatically before a restore
export async function backupNow(kind = "") {
  if (!G.hasToken()) throw Object.assign(new Error("Connect Google first."), { code: "auth" });
  const dir = await backupsFolder();
  const ext = G.canGzip() ? ".json.gz" : ".json";
  const stamp = kind ? `${todayIso()}-${new Date().toTimeString().slice(0, 5).replace(":", "")}` : todayIso();
  const name = `backup-${kind ? kind + "-" : ""}${stamp}${ext}`;
  const existing = await G.driveFind(name, dir);
  const prevInfo = store.data.backup;
  if (!kind) store.data.backup = { ...(prevInfo || {}), lastWeek: weekKey(), lastAt: new Date().toISOString() };   // inside the copy too
  try { await G.driveUpload(name, dir, await G.packJson(store.exportable()), existing?.id); }
  catch (e) { if (!kind) store.data.backup = prevInfo; throw e; }
  // tidy up: keep the newest 8 backups (and the newest 3 safety copies)
  const files = await G.driveList(dir);
  const normal = files.filter((f) => /^backup-\d/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
  const safety = files.filter((f) => f.name.startsWith("backup-before-restore-")).sort((a, b) => b.name.localeCompare(a.name));
  for (const f of [...normal.slice(KEEP), ...safety.slice(KEEP_SAFETY)]) await G.driveDelete(f.id);
  if (!kind) await store.commit("backup");
  return name;
}
export async function listBackups() {
  const files = await G.driveList(await backupsFolder());
  return files.filter((f) => f.name.startsWith("backup-")).sort((a, b) => (b.createdTime || "").localeCompare(a.createdTime || ""));
}
// Restore a Drive backup: a safety copy of the current data is saved first, so a restore can be undone too.
export async function restoreBackup(fileId) {
  const obj = await G.driveReadJson(fileId);
  await backupNow("before-restore");
  await store.replaceAll(obj);   // checked first (cleanDb); then uploaded as the new live data on the next sync
}
// Once a week, after a successful sync, ask whether to save this week's backup (the answer is shared by all devices).
let backupAsker = async () => false;
export const setBackupAsker = (fn) => { backupAsker = fn; };
let asking = false;
async function maybeAskBackup() {
  const wk = weekKey();
  if (asking || store.data.backup?.lastWeek === wk || !store.data.clients.length || store._editorDirty) return;
  asking = true;
  try {
    const yes = await backupAsker();
    if (yes === null) return;   // another window was open: ask later
    if (yes) { await backupNow(); return yes; }
    store.data.backup = { ...(store.data.backup || {}), lastWeek: wk, skipped: true }; await store.commit("backup");
  } catch (e) { console.warn(e); } finally { asking = false; }
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
