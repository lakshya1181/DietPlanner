// Google sign-in (Google Identity Services token flow) + Drive and Calendar REST calls.
// Browser-only: no server, no client secret. Tokens live in memory (about 1 hour).
import { local } from "./store.js";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"; // only files this app creates
let tokenClient = null, token = null, tokenExp = 0, pending = null;

export const clientId = () => local.get("googleClientId", "") || window.APP_CONFIG.googleClientId || "";
export const isConfigured = () => !!clientId();
export const wasConnected = () => !!local.get("googleConnected", false);
export const hasToken = () => token && Date.now() < tokenExp - 60000;
// The Google account this device is connected to (shown in Settings, used so Reconnect skips the account picker).
export const account = () => local.get("googleAccount", null);   // { email, name }
// Keep the sign-in across closing/reopening the app until Google's 1-hour limit runs out (no Reconnect on every open).
(function restoreToken() { const t = local.get("googleToken", null); if (t && t.exp > Date.now() + 60000) { token = t.token; tokenExp = t.exp; } })();
const scopes = () => [DRIVE_SCOPE, window.APP_CONFIG.calendarScope].join(" ");

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error("Could not load Google sign-in. Check your internet connection."));
    document.head.appendChild(s);
  });
}

// Must be called from a user gesture (tap) the first time, or the popup is blocked.
export async function signIn({ prompt, hint } = {}) {
  if (!isConfigured()) throw new Error("Google Client ID is not set. Add it in Settings → Google account.");
  await loadGis();
  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId(), scope: scopes(),
      callback: (r) => {
        const p = pending; pending = null;
        if (r.error) { p?.rej(new Error(r.error_description || r.error)); return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE)) { p?.rej(new Error("Drive permission was not granted.")); return; }
        token = r.access_token; tokenExp = Date.now() + (r.expires_in || 3600) * 1000;
        local.set("googleToken", { token, exp: tokenExp });
        local.set("googleConnected", true);
        local.set("calendarGranted", google.accounts.oauth2.hasGrantedAllScopes(r, window.APP_CONFIG.calendarScope));
        p?.res(token);
      },
      error_callback: (e) => { const p = pending; pending = null; p?.rej(new Error(e.message || e.type || "Sign-in cancelled")); },
    });
  }
  // Reconnecting: no consent screen (permissions were already given) and the known Gmail is passed as a hint,
  // so Google normally signs straight in without the account picker.
  const h = hint === undefined ? account()?.email : hint;
  const opts = { prompt: prompt ?? (wasConnected() ? "" : "consent"), include_granted_scopes: true };
  if (h) { opts.hint = h; opts.login_hint = h; }
  return new Promise((res, rej) => { pending = { res, rej }; tokenClient.requestAccessToken(opts); });
}
// Which Gmail is this? (Drive "about" works with the drive.file permission; no extra permission needed.)
export async function fetchAccount() {
  const r = await api("GET", "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)");
  const a = { email: String(r.user?.emailAddress || "").toLowerCase(), name: r.user?.displayName || "" };
  if (a.email) local.set("googleAccount", a);
  return a;
}
// revoke = also withdraw the app's permission at Google (used when you switch or disconnect for good)
export function signOut({ revoke = true } = {}) {
  if (revoke && token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
  token = null; tokenExp = 0; local.set("googleConnected", false); local.set("googleToken", null); local.set("googleAccount", null);
}
export const calendarGranted = () => !!local.get("calendarGranted", false);

async function api(method, url, { body, headers, raw } = {}) {
  if (!hasToken()) throw Object.assign(new Error("Google session expired. Tap “Connect Google” to continue."), { code: "auth" });
  const r = await fetch(url, { method, headers: { Authorization: "Bearer " + token, ...(headers || {}) }, body });
  if (r.status === 401) { token = null; local.set("googleToken", null); throw Object.assign(new Error("Google session expired. Tap “Connect Google” to continue."), { code: "auth" }); }
  if (!r.ok) { let m = r.statusText; try { m = (await r.json()).error.message; } catch {} throw Object.assign(new Error(`Google: ${m}`), { status: r.status }); }
  if (raw) return r;
  return r.status === 204 ? null : r.json();
}
const json = (obj) => ({ body: JSON.stringify(obj), headers: { "Content-Type": "application/json" } });

// ---------------- Drive ----------------
const DRIVE = "https://www.googleapis.com/drive/v3", UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const q = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export async function driveFind(name, parentId, mime) {
  let query = `name='${q(name)}' and trashed=false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  if (mime) query += ` and mimeType='${mime}'`;
  const r = await api("GET", `${DRIVE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime,createdTime)&orderBy=createdTime&spaces=drive`);   // oldest first: every device picks the same file
  return r.files[0] || null;
}
export async function driveFolder(name, parentId) {
  const FOLDER = "application/vnd.google-apps.folder";
  const hit = await driveFind(name, parentId, FOLDER);
  if (hit) return hit.id;
  const r = await api("POST", `${DRIVE}/files?fields=id`, json({ name, mimeType: FOLDER, parents: parentId ? [parentId] : undefined }));
  return r.id;
}
function multipart(meta, blob) {
  const fd = new FormData();
  fd.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
  fd.append("file", blob);
  return fd;
}
export async function driveUpload(name, parentId, blob, existingId) {
  if (existingId) return api("PATCH", `${UPLOAD}/files/${existingId}?uploadType=multipart&fields=id`, { body: multipart({ name }, blob) });
  return api("POST", `${UPLOAD}/files?uploadType=multipart&fields=id`, { body: multipart({ name, parents: [parentId] }, blob) });
}
// Data files are stored gzip-compressed (5–10× smaller, faster sync). Reading accepts both: compressed files are
// recognised by their first two bytes, so old plain-JSON files still open.
export const canGzip = () => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
export async function packJson(obj) {
  const text = JSON.stringify(obj);
  if (!canGzip()) return new Blob([text], { type: "application/json" });
  const s = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(s).arrayBuffer()], { type: "application/gzip" });
}
export async function unpackJson(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0x1f && b[1] === 0x8b) {
    if (!canGzip()) throw new Error("This browser is too old to read the compressed Drive file. Please update the phone/computer (iPhone: iOS 16.4 or newer).");
    const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(s).text());
  }
  return JSON.parse(new TextDecoder().decode(b));
}
export async function driveReadJson(id) {
  const r = await api("GET", `${DRIVE}/files/${id}?alt=media`, { raw: true });
  return unpackJson(await r.arrayBuffer());
}
export async function driveList(parentId) {
  const query = `'${parentId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`;
  const r = await api("GET", `${DRIVE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,createdTime)&orderBy=name desc&pageSize=100&spaces=drive`);
  return r.files || [];
}
export async function driveDelete(id) {
  try { await api("DELETE", `${DRIVE}/files/${id}`); } catch (e) { if (e.status !== 404) throw e; }
}

// ---------------- Calendar ----------------
const CAL = "https://www.googleapis.com/calendar/v3";
export async function ensureCalendar(knownId) {
  // With the broader "calendar.events" permission the app can't create calendars, so it uses your main calendar.
  if (window.APP_CONFIG.calendarScope.endsWith("/calendar.events")) return "primary";
  if (knownId) {
    try { await api("GET", `${CAL}/calendars/${encodeURIComponent(knownId)}`); return knownId; }
    catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }   // only a deleted calendar is re-created
  }
  const r = await api("POST", `${CAL}/calendars`, json({ summary: window.APP_CONFIG.calendarName, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
  return r.id;
}
export async function upsertEvent(calendarId, ev, existingId) {
  const base = `${CAL}/calendars/${encodeURIComponent(calendarId)}/events`;
  if (existingId) {
    try { return await api("PATCH", `${base}/${existingId}`, json(ev)); }
    catch (e) { if (e.status !== 404 && e.status !== 410) throw e; /* event deleted in Calendar → recreate */ }
  }
  return api("POST", base, json(ev));
}
export async function deleteEvent(calendarId, id) {
  try { await api("DELETE", `${CAL}/calendars/${encodeURIComponent(calendarId)}/events/${id}`); }
  catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }   // already gone = fine
}
