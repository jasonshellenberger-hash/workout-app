# Workout

A personal iPhone workout app (PWA): quiet 15–22 minute home workouts, a guided player with timers, and a local log. Plain HTML, CSS, and JavaScript. No framework and no build step. All data stays on the phone.

**Phase 4 (this version):** everything in Phases 1–3 (plan generator, workout player with timers, logging, per-exercise check-in and progression, the 3 → 5 day ramp, weekly weigh-in and chart, history calendar, "never miss twice" streak) plus a 10-minute short-on-time version, a morning soreness check, and backup and import with a weekly Sunday reminder. See `SPEC.md` (kept local, not in the repo) for later phases.

## Files

| File | What it does |
| --- | --- |
| `index.html` | App shell: the four tabs, workout player, completion screen |
| `styles.css` | Theme tokens (colors from the spec), layout, animations |
| `app.js` | Plan generator, Today / History / Me screens, workout player |
| `db.js` | Storage wrapper: IndexedDB, falling back to localStorage |
| `exercises.json` | Every ladder, rung, rep range, form cue, and demo link. Edit exercises here. |
| `manifest.json` | Home-screen install settings |
| `service-worker.js` | Offline caching |
| `icons/` | App icons |

## Default schedule

- **Mon / Wed / Fri:** Full Body (A and B alternate). Change the days on the **Me** tab.
- **Mon and Fri** add a 2–3 minute quiet finisher, about 19 min total. **Wed** runs about 16 min.
- **Saturday** is never a workout day.
- **Rest days** show a "Train anyway" link if you want an extra session.

---

## Test locally on Windows

1. Open Command Prompt or PowerShell in this project folder.
2. Start a local web server. Python is already installed:
   ```
   python -m http.server 8080
   ```
3. In Chrome or Edge, open **http://localhost:8080**.
4. Press **F12**, then **Ctrl+Shift+M** to turn on the device toolbar, and pick an iPhone size.
5. Press **Ctrl+C** in the terminal to stop the server.

Notes:
- Opening `index.html` by double-clicking it won't work. The app needs a server to load `exercises.json` and the service worker.
- To reset everything, go to DevTools → **Application** → **Storage** → **Clear site data**.
- After editing files, do a hard reload (**Ctrl+Shift+R**). If the old version keeps showing, go to DevTools → **Application** → **Service workers** and click **Unregister**, then reload.
- You can load the page on your iPhone over Wi-Fi at `http://<your-PC's-IP>:8080` to check the layout. Offline mode and a proper install need HTTPS, so use GitHub Pages (below) for real testing on the phone.

---

## Deploy to GitHub Pages (first time)

You need a free GitHub account. Free GitHub Pages sites must come from a **public** repo. `SPEC.md` is in `.gitignore`, so your personal details stay off GitHub.

1. **Create the repo.** On github.com, click **+** → **New repository**.
   - Name: `workout-app`
   - Visibility: **Public**
   - Leave "Add a README" unchecked.
   - Click **Create repository**.
2. **Push the code.** In this folder, run the following, replacing `YOUR-USERNAME`:
   ```
   git remote add origin https://github.com/YOUR-USERNAME/workout-app.git
   git push -u origin main
   ```
   The first push opens a browser window to sign in to GitHub.
3. **Turn on Pages.** In the repo, go to **Settings** → **Pages**.
   - Under "Build and deployment", set Source to **Deploy from a branch**.
   - Set Branch to **main** and the folder to **/ (root)**.
   - Click **Save**.
4. Wait about a minute. The site will be at:
   **https://YOUR-USERNAME.github.io/workout-app/**
   The **Actions** tab shows deploy progress.

## Install on your iPhone

1. Open the Pages URL in **Safari**. It has to be Safari, not Chrome.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open the app from the home screen. It runs full screen, with no Safari bars.
4. Open it once while online. After that it works offline, in the garage dead zone too.

## Redeploy after changes

1. Edit the files and test locally (above).
2. In `service-worker.js`, bump `CACHE_VERSION`, for example `'v1'` → `'v2'`. **This is what tells phones to download the new files.** If you skip it, the phone keeps showing the old cached version.
3. Optionally bump `APP_VERSION` in `app.js`. It shows at the bottom of the Me tab, so you can confirm which version the phone is running.
4. Commit and push:
   ```
   git add -A
   git commit -m "Describe the change"
   git push
   ```
5. On the iPhone, open the app once. It downloads the update in the background. Swipe the app closed and open it again to run the new version.

Only `exercises.json` changed? Still bump `CACHE_VERSION`.

---

## iPhone notes

- **Sound on silent:** the app sets the audio session to "playback" (Safari 17+), so the soft cue tone plays even with the ringer switch on silent. Audio is unlocked when you tap **Start workout**. One side effect: iOS may pause music or a podcast from another app while the tone plays. The screen flash always works as a backup. Both can be turned off on the Me tab, and **Test sound and flash** checks them.
- **No vibration:** iPhone web apps can't vibrate. That's why the screen flashes.
- **Screen stays on** during a workout (Screen Wake Lock). If iOS refuses the request, the app carries on without it.
- **If the app gets closed mid-workout,** reopen it. Today shows **Resume workout** and picks up at the same step.
- **Your data lives only on this phone,** in the app's storage. Deleting the home-screen app deletes its data. Use **Me → Back up now** (or the Sunday reminder on Today) to save a dated JSON file to iCloud Drive or Files. **Me → Import data** restores one, replacing everything on the phone.

## Editing exercises

Each ladder in `exercises.json` lists rungs from easiest to hardest. A rung's `equipment` lists every item it needs. `"db10|db20"` means either one works. Every rung must stay `"quiet": true`. Starting rungs and rep targets are in `START_PROGRESSION` in `app.js`. The check-in moves them after each workout (rules in `adapt.js`).
