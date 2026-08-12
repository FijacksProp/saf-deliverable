# Weekline

Weekline is a responsive virtual class timetable for students. It presents the full teaching week, makes classes easy to find, shows what is happening now, and lets students manage their timetable directly in the browser.

The deployed application is intentionally static, so it can run on Netlify without Django, Flask, a database, or paid services. Python remains part of the project as the validation and schedule-analysis layer.

## Features

- Weekly CSS Grid timetable with a focused single-day view
- Search by subject, lecturer, or class code
- Subject filtering with instant local updates
- Live current-class and next-class status
- Current-day and current-period highlighting
- Keyboard-accessible class details dialog
- Add, edit, and remove timetable entries
- Simple overlap prevention when saving a class
- Browser storage so changes remain after a refresh
- One-click clearing of the timetable
- Responsive layout for desktop, tablet, and mobile
- Python validation and analysis with unit tests

## Project structure

```text
.
├── index.html
├── css/styles.css
├── data/timetable.json
├── js/app.js
├── python/
│   ├── schedule_tools.py
│   └── test_schedule_tools.py
└── netlify.toml
```

## Run locally

The browser loads the timetable with `fetch`, so opening `index.html` directly is not enough. Start a local server from the project root:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Python schedule tools

Validate the live dataset and print a schedule report:

```bash
python python/schedule_tools.py
```

Return the same report as JSON:

```bash
python python/schedule_tools.py --json
```

Run the unit tests:

```bash
python -m unittest discover -s python -p "test_*.py"
```

The command exits with status `1` when the JSON is malformed or a record has an invalid day, time range, type, duplicate ID, or missing field. This makes it suitable for a deployment check later.

## Manage the timetable

The project starts with an empty timetable. Use **Add class** to create the first entry. Select any class card to view its details, edit it, or remove it. The form prevents an end time earlier than the start time and warns when a class overlaps an existing entry on the same day.

Changes are stored in the browser with `localStorage`, so no account or server is required. They belong to that browser and device. Use **Clear timetable** below the grid to remove all locally saved classes.

The `data/timetable.json` file begins as an empty array (`[]`). Classes created through the interface use this shape:

Classes are stored in `data/timetable.json`. Each record uses this shape:

```json
{
  "id": 1,
  "code": "CSC 301",
  "subject": "Data Structures",
  "teacher": "Dr. Nneka Okafor",
  "day": "Monday",
  "start": "08:00",
  "end": "09:30",
  "room": "Virtual Room A",
  "type": "lecture",
  "color": "indigo",
  "link": "#"
}
```

Times use 24-hour `HH:MM` values. The current interface displays classes between 08:00 and 17:00.

## Deploy to Netlify

1. Push this folder to a GitHub repository.
2. In Netlify, choose **Add new site → Import an existing project**.
3. Select the repository.
4. Leave the build command empty and set the publish directory to `.`.
5. Deploy.

The included `netlify.toml` already supplies the publish setting, security headers, and fallback route.

## Technology

- HTML5 with semantic regions and accessible controls
- CSS Grid and responsive CSS
- Vanilla JavaScript using a local JSON dataset
- Python 3 standard library for basic timetable validation and reporting

No runtime framework or external API is required.
