// Default settings. Your edits in Settings are stored separately and override these.
export const DEFAULT_SETTINGS = {
  "branding": {
    "name": "NutriWise Health Studio",
    "tagline": "Eat Smart · Live Balanced",
    "watermarkImage": "assets/logo.png",
    "watermarkWidthRatio": 0.55,
    "watermarkOpacity": 0.07,
    "coverLogo": true,
    "logoDataUrl": null
  },
  "page": {
    "size": "A4",
    "margins": [
      40,
      32,
      40,
      46
    ],
    "landscapeFromDays": 5
  },
  "output": {
    "showLinks": false,
    "chartMaxPoints": 12
  },
  "theme": {
    "font": "Poppins",
    "navy": "#1E3A6B",
    "teal": "#2BA39A",
    "green": "#6BAF2E",
    "coral": "#E5493A",
    "amber": "#E8912A",
    "ink": "#26303D",
    "muted": "#7A8594",
    "soft": "#F4F7FA",
    "link": "#1F7F76",
    "dayHeader": "#1E3A6B",
    "weekendHeader": "#2BA39A"
  },
  "bmiBands": [
    {
      "max": 18.5,
      "label": "Underweight",
      "color": "#D9A21B"
    },
    {
      "max": 25,
      "label": "Normal",
      "color": "#6BAF2E"
    },
    {
      "max": 30,
      "label": "Overweight",
      "color": "#F08A3C"
    },
    {
      "max": 999,
      "label": "Obese",
      "color": "#E5493A"
    }
  ],
  "foodPreferences": [
    {
      "label": "Vegetarian",
      "color": "#2E9E44"
    },
    {
      "label": "Non-Vegetarian",
      "color": "#A0412D"
    },
    {
      "label": "Eggetarian",
      "color": "#D9A21B"
    }
  ],
  "healthFlags": [
    "Acidity",
    "Gas",
    "Bloating",
    "Constipation",
    "Sweet tooth"
  ],
  "bloodGroups": [
    "A+",
    "A-",
    "B+",
    "B-",
    "AB+",
    "AB-",
    "O+",
    "O-"
  ],
  "slotCatalog": {
    "early": {
      "name": "Early Morning",
      "icon": "sunrise",
      "accent": "#E8782A",
      "fill": "#FFF1E5"
    },
    "breakfast": {
      "name": "Breakfast",
      "icon": "cup",
      "accent": "#5E9F25",
      "fill": "#EEF7E3"
    },
    "midmorning": {
      "name": "Mid-Morning",
      "icon": "apple",
      "accent": "#23948B",
      "fill": "#E3F4F2"
    },
    "lunch": {
      "name": "Lunch",
      "icon": "bowl",
      "accent": "#D9412F",
      "fill": "#FDECE9"
    },
    "snacks": {
      "name": "Evening Snacks",
      "icon": "tea",
      "accent": "#C28E0E",
      "fill": "#FFF6DA"
    },
    "dinner": {
      "name": "Dinner",
      "icon": "moon",
      "accent": "#1E3A6B",
      "fill": "#E9EEF8"
    }
  },
  "mealPatterns": {
    "3meal": {
      "label": "3 Meals / Day",
      "slots": [
        {
          "id": "early",
          "time": "6:30 am",
          "mode": "shared"
        },
        {
          "id": "breakfast",
          "time": "9:30 am",
          "mode": "daily"
        },
        {
          "id": "midmorning",
          "time": "12:00 pm",
          "mode": "shared"
        },
        {
          "id": "lunch",
          "time": "2:00 pm",
          "mode": "daily"
        },
        {
          "id": "snacks",
          "time": "5:00 pm",
          "mode": "shared"
        },
        {
          "id": "dinner",
          "time": "8:00 pm",
          "mode": "daily"
        }
      ]
    },
    "2meal": {
      "label": "2 Meals / Day",
      "slots": [
        {
          "id": "early",
          "time": "5:30 am",
          "mode": "shared"
        },
        {
          "id": "breakfast",
          "time": "9:00 am",
          "mode": "shared"
        },
        {
          "id": "midmorning",
          "time": "11:00 am",
          "mode": "daily"
        },
        {
          "id": "lunch",
          "time": "12:30 pm",
          "mode": "shared"
        },
        {
          "id": "snacks",
          "time": "4:30 pm",
          "mode": "shared"
        },
        {
          "id": "dinner",
          "time": "7:30 pm",
          "mode": "daily"
        }
      ]
    }
  },
  "measurements": {
    "unit": "in",
    "sites": [
      {
        "key": "arm",
        "label": "Right Arm",
        "hint": "mid upper arm"
      },
      {
        "key": "chest",
        "label": "Chest",
        "hint": ""
      },
      {
        "key": "waist",
        "label": "Waist",
        "hint": ""
      },
      {
        "key": "abdomen",
        "label": "Abdomen",
        "hint": ""
      },
      {
        "key": "hips",
        "label": "Hips",
        "hint": ""
      },
      {
        "key": "thigh",
        "label": "Right Thigh",
        "hint": "upper thigh"
      }
    ]
  },
  "defaults": {
    "exercise": [
      {
        "text": "Brisk walk",
        "duration": "20 mins",
        "link": ""
      }
    ],
    "servingSizes": [
      {
        "value": "5 g",
        "label": "1 Teaspoon"
      },
      {
        "value": "15 g",
        "label": "1 Tablespoon"
      },
      {
        "value": "150 ml",
        "label": "1 Cup"
      },
      {
        "value": "150 g",
        "label": "1 Katori"
      }
    ],
    "guidelines": [
      {
        "type": "avoid",
        "title": "Avoid",
        "items": [
          "Edit your default 'Avoid' list in Settings"
        ]
      },
      {
        "type": "prefer",
        "title": "Prefer",
        "items": [
          "Edit your default 'Prefer' list in Settings"
        ]
      }
    ],
    "water": "8-10 Glasses / Day"
  },
  "reminders": {
    "planEndDaysBefore": 1,
    "planEndTime": "10:00",
    "appointmentAlerts": [
      1440,
      60
    ]
  },
  "sync": {
    "saveExportsToDrive": true
  },
  "healthIssuesTitle": "Health issues",
  "clientIdPrefix": "C",
  "defaultCountryCode": "91",
  "severityLevels": [
    {
      "key": "mild",
      "label": "Mild"
    },
    {
      "key": "moderate",
      "label": "Moderate"
    },
    {
      "key": "severe",
      "label": "Severe"
    }
  ],
  "pdfSections": {
    "program": true,
    "recipes": true,
    "statTiles": true,
    "weightProgress": true,
    "measurements": true,
    "health": true,
    "food": true,
    "weightRow": true,
    "clientNotes": true,
    "callSummary": false,
    "exercise": true,
    "servingGuide": true,
    "guidelines": true
  }
};

// Names shown for the PDF section switches (Settings and plan editor).
export const PDF_SECTIONS = [
  ["program", "Cover: program dates & day number"],
  ["statTiles", "Cover: age, height, blood group, BMI tiles"],
  ["weightProgress", "Cover: weight progress & chart"],
  ["measurements", "Cover: body measurements"],
  ["health", "Cover: health card"],
  ["food", "Cover: food card"],
  ["weightRow", "Daily weight row (bottom of meal table)"],
  ["clientNotes", "Meal table: notes for the client"],
  ["callSummary", "Consultation summary"],
  ["exercise", "Exercise routine"],
  ["servingGuide", "Serving guide"],
  ["guidelines", "General guidelines (Avoid / Prefer)"],
  ["recipes", "Recipes chosen for the plan"],
];
