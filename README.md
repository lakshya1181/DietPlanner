# NutriWise Diet Planner

A web app for creating client diet plans and exporting them as **PDF** and/or a **PNG** of the meal table.
It runs in any browser (Android, iPhone, Windows), installs to the home screen, and stores its data in
**your own Google Drive**. There is no server and no monthly cost.

---

## What it does

- **Clients:** profile with live BMI (colour-coded), weight log with an automatic chart, and body measurements.
  Also records health issues, blood group, food preference (veg / non-veg / egg), likes, dislikes and allergies.
- **Plans:** 1–7 days, **3 meals/day or 2 meals/day** (asked once per client, then remembered).
  Each meal slot can be *Daily* or *Same all days*, and daily weights can be entered for each day.
- **Meal list:** one list for every slot. Anything you type in a plan is saved and suggested next time.
- **Export:** PDF, PNG (meal table only) or both. Share straight to WhatsApp or email on phones; download on PC.
  A copy can be saved to Drive automatically.
- **Reminders:**
  - Plan-ending and appointment reminders go into Google Calendar.
  - The Today screen lists plans that are ending.
  - You can send a one-tap WhatsApp reminder to a client.

---

## 1. Put it online (GitHub Pages, free) – about 5 minutes

1. Create a free account at <https://github.com> if you don't have one.
2. Click **New repository** and name it, for example, `dietplanner`.
   - Select **Public**. The free GitHub plan needs a public repository for Pages.
   - No client data is ever stored in the repository.
3. On the new repository, click **Add file → Upload files** and drag in **everything in this folder**.
   - That includes `index.html`, `sw.js`, `manifest.webmanifest` and the `css`, `js`, `vendor` and `assets` folders.
   - Then click **Commit changes**.
4. Go to **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**,
   branch **main**, folder **/ (root)**, then **Save**.
5. After about 1 minute your app is live at `https://YOUR-USERNAME.github.io/dietplanner/`.

The app already works at this point, with data saved **on that device only**. Step 2 adds Google Drive sync and calendar reminders.

### Alternative: Netlify Drop (no GitHub, about 2 minutes)

1. Unzip the folder on your laptop.
2. Open <https://app.netlify.com/drop> and create a free account (without one, the site expires).
3. Drag the whole app folder onto the page. You get a link like `https://something.netlify.app`.
4. In step 2 below, use this address as the **Authorized JavaScript origin**.

### Only testing on a laptop?

Use **Diet Planner.html** (single file). Double-click it to open in Chrome or Edge.

- Data is saved in that browser only.
- Google Drive and Calendar don't work in this file. Google needs an https web address.
- It doesn't run on phones.

## 2. Connect Google Drive and Calendar – about 10 minutes, one time

1. Open <https://console.cloud.google.com/> with the Gmail account that should hold the data.
2. Use the project picker at the top to create a **New Project**, for example "Diet Planner".
3. Enable both APIs. Go to **APIs & Services → Library**, then:
   - search **Google Drive API** → **Enable**
   - search **Google Calendar API** → **Enable**
4. Set up the consent screen (in newer consoles it's called **Google Auth Platform → Branding / Audience / Data access**).
   Go to **APIs & Services → OAuth consent screen**:
   - User type **External**. App name: *Diet Planner*. Fill in the support email and developer email.
   - **Scopes / Data access → Add scopes:**
     - `.../auth/drive.file`
     - `.../auth/calendar.app.created`
   - **Test users / Audience:** add your Gmail address, plus anyone else who will use the app (up to 100).
   - Leave the app in **Testing**. No Google review is needed for you and your test users.
5. Create the Client ID. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins:** `https://YOUR-USERNAME.github.io`
     (no trailing slash and no `/dietplanner`).
   - Click **Create** and copy the **Client ID** (it ends in `.apps.googleusercontent.com`).
   - **Authorized redirect URIs:** `https://YOUR-USERNAME.github.io/dietplanner/` (with the slash at the end).
     The installed app signs in through this address instead of a pop-up window.
6. Add the Client ID to the app, choosing one of these:
   - **Easiest:** open the app → **Settings → Google account** → paste it → **Connect Google**.
     This has to be done once on each device.
   - **Once for every device:** edit `js/config.js` on GitHub, set `googleClientId: "…"` and commit.
7. Tap **Connect Google**. Google will say **"Google hasn't verified this app"**. This is normal for your own app in
   Testing mode: tap **Continue** and allow access.

**If Google rejects the `calendar.app.created` permission:**

- In `js/config.js`, set `calendarScope` to `"https://www.googleapis.com/auth/calendar.events"` and add that scope to the consent screen instead.
- Reminders will then go into your main calendar rather than a separate one.

### Connecting each device (do the device that has your data FIRST)

1. On the device that already has your clients: Settings → Google account → **Connect Google** → choose your Gmail → allow. Wait for "Synced with Google Drive".
2. On every other device: open the same link, install it, then Settings → **Connect Google** with the **same Gmail**. The app downloads your data from Drive.
   - If that device already had test data, the app asks **"Two versions found"** → choose **Keep Drive copy**.
3. On iPhone the home-screen app and Safari keep separate copies: connect Google inside the one you actually use.

### After connecting
- **Settings → Google Drive** shows the Gmail you're connected to, with *Sync now*, *Switch account* and *Disconnect*.
- **Reconnect** (about once an hour, Google's rule) is one tap: no permission screen and no account picker.
- **Weekly backup:** after a sync the app asks once a week whether to save a backup copy in *Drive → NutriWise Diet Planner → Backups* (last 8 kept). *Back up now* and *Restore from a Drive backup* are in Settings.
- **Recycle bin** (Settings): deleted items can be restored for 30 days.
- The Drive data file is stored compressed. **After updating, open the app once on every device** – an old version can't read it (it shows an error and changes nothing).

## 3. Install on phones and PC

- **Android (Chrome):** open the link and tap **Install** on the Today screen, or use the ⋮ menu → *Install app*.
- **Windows (Chrome/Edge):** use the **Install** button, or the install icon in the address bar.
- **iPhone/iPad (Safari):** tap **Share** → **Add to Home Screen**. The app shows these steps if you tap Install.

---

## How data is kept safe

- Everything is stored on the device first, so the app works offline.
- When Google is connected, the data is also copied to **Google Drive → "NutriWise Diet Planner" → `nutriwise-data.json`**.
  Exports go to **Exports / <client name>**.
- The app can only see files it created itself, not the rest of your Drive.
- **If two devices change data before syncing**, the app asks which version to keep.
- **Backups:** Settings → Data → **Download backup** saves a `.json` file you can restore anytime.
  Do this every few weeks.
- **Re-connecting:** Google sign-in lasts about an hour. After that, the app shows **Reconnect**; one tap continues.
  This is Google's rule for browser apps.

## Changing things without code (Settings)

You can change any of the following in Settings:

- Logo, business name and tagline; watermark strength; A4 or Letter paper
- Meal slot names and times, and which slots are *Daily* in the 3-meal and 2-meal plan types
- Health issue tick-boxes; BMI ranges (Standard or Asian-Indian presets)
- Body measurement list and unit (inches or cm)
- Default exercise, serving guide, Avoid/Prefer lists and water intake
- Show recipe/video links in the PDF (off by default; links are still saved)
- Reminder timing

## Updating the app later

Upload changed files to your hosting (GitHub or Netlify) the same way. Then, in `sw.js`, raise the version in
`const CACHE = "nutriwise-v1.0.0"`, for example to `v1.0.1`. Phones then pick up the new version and show **Update**.

## Technical notes

- Plain HTML, CSS and JavaScript with no build step.
  - PDFs are made in the browser with pdfmake 0.2.15.
  - PNGs are drawn with pdf.js 3.11.174, from a one-page table PDF so the PNG matches the PDF exactly.
  - The font is Poppins (SIL Open Font License).
- pdf.js 3.x has a known issue with opening *untrusted* PDFs. This app only opens PDFs it just generated itself,
  with `isEvalSupported: false`, so that issue doesn't apply here.
- Files:
  - `js/render.js`: PDF layout
  - `js/views/*`: screens
  - `js/store.js`: local database
  - `js/sync.js` and `js/google.js`: Drive and Calendar
  - `js/defaults.js`: default settings
