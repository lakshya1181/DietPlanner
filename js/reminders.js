// Reminders: Google Calendar events (separate "NutriWise Clients" calendar), .ics fallback, WhatsApp links.
import { store } from "./store.js";
import * as G from "./google.js";
import { addDaysIso, fmtDate, to12 } from "./ui.js";

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const calendarReady = () => G.hasToken() && G.calendarGranted();

async function calendarId() {
  const id = await G.ensureCalendar(store.data.googleCalendarId);
  if (id !== store.data.googleCalendarId) { store.data.googleCalendarId = id; await store.commit("calendar"); }
  return id;
}
const addMinutes = (date, time, mins) => {
  const [y, mo, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number);
  const t = new Date(y, mo - 1, d, h, mi + mins);
  const p = (n) => String(n).padStart(2, "0");
  return { date: `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`, time: `${p(t.getHours())}:${p(t.getMinutes())}` };
};

// ---------- event descriptions ----------
export function planEndReminder(plan, client) {
  const s = store.settings.reminders;
  const end = addDaysIso(plan.startDate, plan.days - 1);
  const date = addDaysIso(end, -s.planEndDaysBefore);
  const fin = addMinutes(date, s.planEndTime, 15);
  return { title: `Next plan due: ${client.name}`, date, time: s.planEndTime, endDate: fin.date, endTime: fin.time,
    details: `${client.name}'s current plan ends on ${fmtDate(end, { weekday: true })}. Prepare the next plan.`, alerts: [0] };
}
export function appointmentReminder(a, client) {
  const fin = addMinutes(a.date, a.time, a.duration || 30);
  return { title: `${a.type || "Appointment"}: ${client?.name || ""}`.trim(), date: a.date, time: a.time, endDate: fin.date, endTime: fin.time,
    details: [a.notes, client?.phone ? `Phone: ${client.phone}` : ""].filter(Boolean).join("\n"), alerts: store.settings.reminders.appointmentAlerts };
}
const toEvent = (r) => ({
  summary: r.title, description: r.details,
  start: { dateTime: `${r.date}T${r.time}:00`, timeZone: TZ }, end: { dateTime: `${r.endDate}T${r.endTime}:00`, timeZone: TZ },
  reminders: { useDefault: false, overrides: r.alerts.map((m) => ({ method: "popup", minutes: m })) },
});

/** Create or update the calendar event; returns event id, or null if Google Calendar isn't connected. */
export async function pushReminder(r, existingId) {
  if (!calendarReady()) return null;
  const cal = await calendarId();
  const ev = await G.upsertEvent(cal, toEvent(r), existingId);
  return ev.id;
}
// Remove a calendar event. If Google isn't connected right now, remember it and remove it after the
// next successful sync, so deleted plans/clients never keep sending alerts.
export async function removeReminder(eventId) {
  if (!eventId) return;
  if (!calendarReady() || !store.data.googleCalendarId) { await queueDelete(eventId); return; }
  try { await G.deleteEvent(store.data.googleCalendarId, eventId); } catch (e) { await queueDelete(eventId); throw e; }
}
// The queue is saved straight away, so it survives closing the app.
async function queueDelete(id) {
  store.data.pendingEventDeletes ||= [];
  if (!store.data.pendingEventDeletes.includes(id)) { store.data.pendingEventDeletes.push(id); await store.commit("calendar"); }
}
export async function flushPendingDeletes() {
  const q = store.data.pendingEventDeletes || [];
  if (!q.length || !calendarReady() || !store.data.googleCalendarId) return;
  const left = [];
  // Only a successful delete leaves the queue (deleteEvent treats "already gone" 404/410 as success);
  // network errors, rate limits or a Google outage keep it for the next sync.
  for (const id of q) { try { await G.deleteEvent(store.data.googleCalendarId, id); } catch (e) { left.push(id); } }
  store.data.pendingEventDeletes = left;
  await store.commit("calendar");
}

// ---------- .ics file (works with any calendar app, no Google needed) ----------
export function icsFile(r) {
  const stamp = (d, t) => { const [y, mo, dd] = d.split("-").map(Number), [h, mi] = t.split(":").map(Number);
    return new Date(y, mo - 1, dd, h, mi).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; };   // local time → UTC
  const escI = (s) => String(s || "").replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const alarms = r.alerts.map((m) => `BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:${escI(r.title)}\r\nTRIGGER:-PT${m}M\r\nEND:VALARM`).join("\r\n");
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NutriWise//Diet Planner//EN", "BEGIN:VEVENT",
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@nutriwise`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART:${stamp(r.date, r.time)}`, `DTEND:${stamp(r.endDate, r.endTime)}`,
    `SUMMARY:${escI(r.title)}`, `DESCRIPTION:${escI(r.details)}`, alarms, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return new File([body], `${r.title.replace(/[\\/:*?"<>|]+/g, "-")}.ics`, { type: "text/calendar" });
}

// ---------- WhatsApp ----------
export function waNumber(phone, code) {
  const d = String(phone || "").replace(/\D/g, "");
  const cc = String(code || store.settingsRO.defaultCountryCode || "91").replace(/\D/g, "");
  if (d.length > 10 && d.startsWith(cc)) return d;          // older numbers saved with the code
  return d.length >= 6 ? cc + d.replace(/^0+/, "") : "";
}
export function waLink(phone, text, code) { const n = waNumber(phone, code); return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null; }
export function appointmentMessage(a, client) {
  const brand = store.settings.branding.name;
  return `Hi ${client.name.split(" ")[0]}, this is a reminder of your ${String(a.type || "appointment").toLowerCase()} with ${brand} on ${fmtDate(a.date, { weekday: true })} at ${to12(a.time)}. See you then!`;
}
export function planMessage(client) {
  return `Hi ${client.name.split(" ")[0]}, your new diet plan from ${store.settings.branding.name} is attached. Please follow it and share your weight daily.`;
}
