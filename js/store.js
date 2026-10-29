// Local-first data store. The whole database is one JSON object kept in IndexedDB
// (works offline, no 5 MB localStorage limit) and mirrored to Google Drive by sync.js.
import { DEFAULT_SETTINGS } from "./defaults.js";

const IDB_NAME = "nutriwise", IDB_STORE = "kv", DB_KEY = "db";
const SCHEMA = 1;

// One connection, opened once (re-opened if the browser closes it).
let dbConn = null;
function idb() {
  if (dbConn) return dbConn;
  dbConn = new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => { const d = r.result; d.onclose = () => { dbConn = null; }; d.onversionchange = () => { d.close(); dbConn = null; }; res(d); };
    r.onerror = () => { dbConn = null; rej(r.error); };
    r.onblocked = () => { dbConn = null; rej(new Error("storage is blocked by another window")); };
  });
  return dbConn;
}
async function idbGet(key) {
  const d = await idb();
  return new Promise((res, rej) => { const q = d.transaction(IDB_STORE).objectStore(IDB_STORE).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function idbSet(key, val) {
  const d = await idb();
  return new Promise((res, rej) => {
    const t = d.transaction(IDB_STORE, "readwrite");
    t.objectStore(IDB_STORE).put(val, key);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error || new Error("write failed"));
    t.onabort = () => rej(t.error || new Error("storage full or write was cancelled"));   // quota errors only fire "abort"
  });
}

export const uid = (p) => (p || "") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
export function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? structuredClone(base) : structuredClone(over);
  const out = structuredClone(base);
  for (const k of Object.keys(over)) out[k] = k in base ? deepMerge(base[k], over[k]) : structuredClone(over[k]);
  return out;
}
export const normText = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

function emptyDb() {
  return { schema: SCHEMA, rev: 0, updatedAt: null, settings: {}, clients: [], plans: [], library: [], appointments: [], recipes: [], pendingEventDeletes: [],
    meta: { baseRev: 0, dirty: false, changeSeq: 0, deviceId: uid("dev-") } };
}

// Check a backup / Drive copy before it is used. Throws if the file isn't usable; repairs small problems
// (bad day counts, missing names, impossible weights) and drops records that can't be shown (no id / start date).
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function cleanDb(obj) {
  if (!isObj(obj)) throw new Error("Not a Diet Planner backup file");
  const lists = ["clients", "plans", "library", "appointments", "recipes", "pendingEventDeletes"];
  for (const k of lists) if (obj[k] != null && !Array.isArray(obj[k])) throw new Error(`"${k}" in the file is not a list`);
  if (!Array.isArray(obj.clients)) throw new Error("Not a Diet Planner backup file");
  if (obj.settings != null && !isObj(obj.settings)) throw new Error("Settings in the file are damaged");
  const d = structuredClone(obj);
  const arr = (v) => (Array.isArray(v) ? v : []);
  d.clients = d.clients.filter((c) => isObj(c) && c.id).map((c) => ({ ...c, name: String(c.name || "").trim() || "Unnamed client",
    weightLog: arr(c.weightLog).filter((w) => isObj(w) && ISO.test(w.date) && +w.kg > 0 && +w.kg < 500),
    measurementLog: arr(c.measurementLog).filter((m) => isObj(m) && ISO.test(m.date)),
    privateNotes: arr(c.privateNotes).filter(isObj) }));
  d.plans = arr(d.plans).filter((p) => isObj(p) && p.id && p.clientId && ISO.test(p.startDate))
    .map((p) => ({ ...p, days: Math.min(7, Math.max(1, Math.round(+p.days) || 7)), meals: isObj(p.meals) ? p.meals : {} }));
  d.library = arr(d.library).filter((m) => isObj(m) && String(m.text || "").trim());
  d.appointments = arr(d.appointments).filter((a) => isObj(a) && a.id && ISO.test(a.date));
  d.recipes = arr(d.recipes).filter((r) => isObj(r) && r.id);
  d.pendingEventDeletes = arr(d.pendingEventDeletes).filter((x) => typeof x === "string");
  return d;
}

const listeners = new Set();
export const store = {
  data: null,
  loadError: null,
  // Read saved data. If the browser can't open its storage we do NOT start with an empty, writable
  // database (that could overwrite everything later): the app shows a "couldn't open" screen instead.
  async load() {
    this.loadError = null;
    let d = null;
    try { d = await idbGet(DB_KEY); }
    catch (e) { console.error("IndexedDB unavailable", e); this.loadError = e; this.data = emptyDb(); return this.data; }
    this.data = d && d.schema ? d : emptyDb();
    this.data.meta = { ...emptyDb().meta, ...(this.data.meta || {}) };
    this.migrate();
    try { navigator.storage?.persist?.(); } catch {}   // ask the browser not to clear our data
    return this.data;
  },
  // Bring older data up to date (safe to run repeatedly).
  migrate() {
    const d = this.data;
    d.clients ||= []; d.plans ||= []; d.library ||= []; d.appointments ||= []; d.pendingEventDeletes ||= []; d.recipes ||= [];
    // Client IDs (C-0001…) in order of creation for clients that don't have one yet
    let max = Math.max(0, ...d.clients.map((c) => parseInt(String(c.code || "").replace(/\D/g, ""), 10) || 0));
    [...d.clients].sort((a, b) => String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")))
      .forEach((c) => { if (!c.code) c.code = this.formatCode(++max); });
  },
  formatCode(n) { return `${(this.settingsRO.clientIdPrefix || "C")}-${String(n).padStart(4, "0")}`; },
  // Next number in the current prefix's series (e.g. C-0007); IDs you typed yourself don't affect it.
  nextClientCode() {
    const pre = (this.settingsRO.clientIdPrefix || "C").toUpperCase(), re = new RegExp(`^${pre.replace(/[^A-Z0-9]/g, "\\$&")}-(\\d+)$`, "i");
    const used = new Set(this.data.clients.map((c) => String(c.code || "").toUpperCase()));
    let n = Math.max(0, ...this.data.clients.map((c) => +(re.exec(String(c.code || ""))?.[1] || 0))) + 1;
    while (used.has(this.formatCode(n).toUpperCase())) n++;
    return this.formatCode(n);
  },

  // Settings = defaults overlaid with the user's saved overrides. Cached; `settings` returns a copy you may
  // change, `settingsRO` the shared read-only object (fast, for lists and calculations).
  _settingsCache: null,
  get settingsRO() { return (this._settingsCache ||= deepMerge(DEFAULT_SETTINGS, this.data.settings || {})); },
  get settings() { return structuredClone(this.settingsRO); },
  setSettings(full) { this.data.settings = full; this._settingsCache = null; return this.commit("settings"); },

  saveError: null,
  async commit(reason, { fromSync = false } = {}) {
    if (!fromSync) {
      this.data.updatedAt = new Date().toISOString();
      this.data.meta.dirty = true;
      this.data.meta.changeSeq = (this.data.meta.changeSeq || 0) + 1;   // lets sync detect edits made during an upload
    }
    this._settingsCache = null;
    if (!this.active) {   // this window gave the data to another window: never write an old copy over it
      const e = new Error("This app is open in another window. Use that window.");
      e.saveFailed = true; this.saveError = e; listeners.forEach((fn) => fn("save-error", fromSync)); throw e;
    }
    try { await idbSet(DB_KEY, this.data); }
    catch (e) {
      // The change stays in memory (a later successful save writes it), but the screen must NOT say "saved":
      // the error is passed on so editors stay "unsaved", and a banner stays up until a save works.
      console.error(e); this.saveError = e; e.saveFailed = true;
      listeners.forEach((fn) => fn("save-error", fromSync)); throw e;
    }
    if (this.saveError) { this.saveError = null; listeners.forEach((fn) => fn("save-ok", fromSync)); }
    listeners.forEach((fn) => fn(reason, fromSync));
  },

  // ---------- one window at a time ----------
  // Every window keeps the whole database in memory and writes all of it, so two open windows (two tabs, or the
  // installed app plus a browser tab) would overwrite each other's saves. A Web Lock lets only one window work;
  // the others show "open in another window" with a "Use it here" button.
  active: true,
  async claimTab(wait = false) {
    if (!navigator.locks) { this.active = true; return true; }   // very old browsers: no protection possible
    return new Promise((res) => {
      navigator.locks.request("nutriwise-db", wait ? {} : { ifAvailable: true }, (lock) => {
        if (!lock) { this.active = false; res(false); return; }
        this.active = true; res(true);
        return new Promise((release) => { this._release = release; });   // held while this window works
      }).catch(() => { this.active = true; res(true); });
    });
  },
  releaseTab() { this.active = false; this._release?.(); this._release = null; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  // Replace everything (restore backup or pull from Drive)
  // The incoming file is checked and repaired on a copy FIRST; current data is only replaced when that succeeds,
  // so a broken backup (or Drive file) can never wipe what is on the device.
  async replaceAll(obj, { fromSync = false, baseRev } = {}) {
    const meta = this.data.meta;
    const next = { ...emptyDb(), ...cleanDb(obj), meta: { ...meta, dirty: !fromSync, baseRev: baseRev ?? meta.baseRev } };
    const prev = this.data;
    try { this.data = next; this._settingsCache = null; this.migrate(); this.settingsRO; }
    catch (e) { this.data = prev; this._settingsCache = null; throw new Error("The file has data this app can't read (" + e.message + ")"); }
    await this.commit("replace", { fromSync });
  },
  exportable() { const { meta, ...rest } = this.data; return rest; },

  // ---- clients ----
  client(id) { return this.data.clients.find((c) => c.id === id); },
  upsertClient(c) {
    if (!c.id) c.id = uid("c-");
    if (!c.code) c.code = this.nextClientCode();
    c.updatedAt = new Date().toISOString();
    const i = this.data.clients.findIndex((x) => x.id === c.id);
    if (i >= 0) this.data.clients[i] = c; else this.data.clients.push(c);
    return this.commit("client").then(() => c);
  },
  deleteClient(id) {
    this.data.clients = this.data.clients.filter((c) => c.id !== id);
    this.data.plans = this.data.plans.filter((p) => p.clientId !== id);
    this.data.appointments = this.data.appointments.filter((a) => a.clientId !== id);
    return this.commit("client");
  },

  // ---- plans ----
  plan(id) { return this.data.plans.find((p) => p.id === id); },
  plansFor(clientId) { return this.data.plans.filter((p) => p.clientId === clientId).sort((a, b) => b.startDate.localeCompare(a.startDate)); },
  upsertPlan(p) {
    if (!p.id) { p.id = uid("p-"); p.createdAt = new Date().toISOString(); }
    p.updatedAt = new Date().toISOString();
    const copy = structuredClone(p);
    const i = this.data.plans.findIndex((x) => x.id === p.id);
    if (i >= 0) this.data.plans[i] = copy; else this.data.plans.push(copy);
    return this.commit("plan").then(() => structuredClone(copy));
  },
  deletePlan(id) { this.data.plans = this.data.plans.filter((p) => p.id !== id); return this.commit("plan"); },

  // ---- meal library (one list for every slot) ----
  learnMeals(texts) {
    const have = new Map(this.data.library.map((m) => [normText(m.text), m]));
    let added = 0;
    for (const t of texts) {
      const k = normText(t);
      if (!k) continue;
      const hit = have.get(k);
      if (hit) hit.lastUsed = todayIso();
      else { const m = { id: uid("m-"), text: String(t).trim(), link: "", lastUsed: todayIso() }; this.data.library.push(m); have.set(k, m); added++; }
    }
    return added;
  },
  // How many saved plans contain each meal (counted once per plan, however often it is saved or repeated).
  mealUsage() {
    const n = new Map();
    for (const p of this.data.plans) {
      const seen = new Set();
      // only what the plan actually prints: the slots of its plan type, in their current mode (Daily / Same all days)
      const R = globalThis.DietRender;
      const slots = R ? R.resolveSlots(p, this.settingsRO) : Object.keys(p.meals || {}).map((id) => ({ id, mode: null }));
      for (const sl of slots) {
        const m = (p.meals || {})[sl.id]; if (!m) continue;
        const texts = sl.mode === "shared" ? [m.shared] : sl.mode === "daily" ? (m.days || []).slice(0, +p.days || 7) : [m.shared, ...(m.days || []).slice(0, +p.days || 7)];
        for (const t of texts) { const k = normText(typeof t === "object" && t ? t.text : t); if (k) seen.add(k); }
      }
      seen.forEach((k) => n.set(k, (n.get(k) || 0) + 1));
    }
    return n;
  },
  upsertMeal(m) {
    if (!m.id) m.id = uid("m-");
    const i = this.data.library.findIndex((x) => x.id === m.id);
    if (i >= 0) this.data.library[i] = m; else this.data.library.push(m);
    return this.commit("library");
  },
  deleteMeal(id) { this.data.library = this.data.library.filter((m) => m.id !== id); return this.commit("library"); },

  // ---- recipes ----
  recipe(id) { return this.data.recipes.find((r) => r.id === id); },
  upsertRecipe(r) {
    if (!r.id) { r.id = uid("r-"); r.createdAt = new Date().toISOString(); }
    r.updatedAt = new Date().toISOString();
    const copy = structuredClone(r), i = this.data.recipes.findIndex((x) => x.id === r.id);
    if (i >= 0) this.data.recipes[i] = copy; else this.data.recipes.push(copy);
    return this.commit("recipe").then(() => structuredClone(copy));
  },
  deleteRecipe(id) {
    this.data.recipes = this.data.recipes.filter((r) => r.id !== id);
    for (const p of this.data.plans) if (p.recipeIds) p.recipeIds = p.recipeIds.filter((x) => x !== id);
    return this.commit("recipe");
  },

  // ---- appointments ----
  upsertAppointment(a) {
    if (!a.id) a.id = uid("a-");
    const i = this.data.appointments.findIndex((x) => x.id === a.id);
    if (i >= 0) this.data.appointments[i] = a; else this.data.appointments.push(a);
    return this.commit("appointment").then(() => a);
  },
  deleteAppointment(id) { this.data.appointments = this.data.appointments.filter((a) => a.id !== id); return this.commit("appointment"); },
};

// Device-only preferences (never synced): Google client id, connection flag, last view mode.
export const local = {
  get(k, d) { try { const v = localStorage.getItem("nw-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("nw-" + k, JSON.stringify(v)); } catch {} },
};
