# Cut Tracker v2

A self-contained, installable dashboard that live-syncs from a Google Sheet and turns the raw daily log into insights (maintenance/TDEE estimate, goal projection, adherence, streaks, weekly rollups). Read-only — all data is entered in the Google Sheet. No external runtime libraries; all charts are hand-drawn on canvas.

## Files
| File | Purpose |
|---|---|
| `index.html` | Markup / structure |
| `styles.css` | Design system (light + dark, RTL, responsive) |
| `app.js` | Data load, analytics, charts, PWA. **Config lives at the top.** |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: installable + offline |

## Configure
Open `app.js` and edit the `CONFIG` block at the top:
- `SHEET_ID`, `SHEET_GID` — which sheet/tab to read.
- `START_WEIGHT`, `GOAL_WEIGHT` — hero progress + goal line (currently 102.6 → 90.0).
- `PROTEIN_TARGET`, `CALORIE_TARGET`, `STEPS_TARGET`, `GREAT_SCORE` — adherence + streak thresholds.

Add or edit days directly in the Google Sheet — the dashboard picks up changes on the next sync (auto every 5 min, or the ↻ button). The sheet must have this header row (order matters):
`date, day, weight, calories_low, calories_high, protein_low, protein_high, steps, active_energy, activity, deficit_low, deficit_high, score`

## Run locally
```bash
python3 -m http.server 8777
```
Then open http://localhost:8777 . (A server is required — `file://` blocks the service worker and some fetches.)

## Deploy (public, with PWA install)
Push these files to a repo and enable **GitHub Pages** (Settings → Pages → deploy from branch). HTTPS is automatic and is required for install/offline. Open the URL on your phone → "Add to Home Screen".

## Notes
- Offline: the service worker caches the app shell; the last successful sync is stored in `localStorage`, so opening offline shows your real latest data (not the baked cold-start fallback).
- Weight analytics (TDEE, projected goal date, rate) need at least 2 weigh-ins in the `weight` column — the more you log, the better the projection.
