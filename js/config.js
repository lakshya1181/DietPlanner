// Deployment configuration. Edit once when you set up the app.
// The Google Client ID can also be entered in the app under Settings → Google account.
window.APP_CONFIG = {
  googleClientId: "",                       // e.g. "1234-abc.apps.googleusercontent.com"
  driveFolderName: "NutriWise Diet Planner", // folder created in your Google Drive
  calendarName: "NutriWise Clients",        // separate calendar for reminders
  // Narrowest calendar permission: lets the app manage only calendars it creates.
  // If Google rejects it for your project, switch to "https://www.googleapis.com/auth/calendar.events".
  calendarScope: "https://www.googleapis.com/auth/calendar.app.created",
  appVersion: "1.7.1",
};
