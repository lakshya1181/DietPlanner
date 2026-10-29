// Offline support: app files are cached; data stays in IndexedDB / Google Drive.
const CACHE = "nutriwise-v1.7.1";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/config.js", "js/defaults.js", "js/render.js", "js/app.js", "js/store.js", "js/ui.js", "js/model.js",
  "js/google.js", "js/sync.js", "js/export.js", "js/reminders.js",
  "js/views/dashboard.js", "js/views/clients.js", "js/views/client.js", "js/views/clientForm.js",
  "js/views/plan.js", "js/views/library.js", "js/views/appointments.js", "js/views/settings.js", "js/views/exportDialog.js", "js/views/recipe.js",
  "vendor/pdfmake.min.js", "vendor/pdf.min.js", "vendor/pdf.worker.min.js",
  "assets/logo.png", "assets/icons/icon-180.png", "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/maskable-512.png",
  "assets/fonts/poppins-full-400.woff", "assets/fonts/poppins-full-600.woff", "assets/fonts/sym-400.woff", "assets/fonts/sym-600.woff",
  "assets/fonts/poppins-latin-400-normal.woff2", "assets/fonts/poppins-latin-500-normal.woff2", "assets/fonts/poppins-latin-600-normal.woff2",
];
// cache: "reload" fetches fresh copies from the server, never an older copy from the browser's own cache
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Google APIs go straight to network
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
