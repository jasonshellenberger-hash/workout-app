# Notes

## Phase 1: what's included

- **Plan generator.**
  - Full Body A and B alternate on Mon/Wed/Fri by default, and Saturday is never a workout day.
  - Each session has a warm-up, a 4-exercise circuit, arm care, and an optional 5-minute stretch.
  - Mon and Fri add a quiet finisher. The plan drops to 2 circuit rounds to stay under 18 min (Wed) or 22 min (Mon/Fri).
- **Equipment and quiet mode.** The generator only picks exercises you have the equipment for. If you don't own what an exercise needs, it steps down to an easier one on the same ladder. Quiet mode is always on.
- **Workout player.**
  - One exercise per screen, with large reps or a countdown ring, a form cue, a demo link, and a "Next up" preview.
  - Done, Skip, pause, +15s on rest, and auto-advance.
  - A soft sound cue plus a screen flash. The tone plays on silent where Safari supports it.
  - The screen stays awake during a workout. If iOS refuses, the app carries on quietly.
- **Logging.** Completed workouts and ones ended early ("partial") are saved per exercise, with sets planned, done, and skipped. A workout interrupted by closing the app can be resumed.
- **Tabs.**
  - **Today:** the workout card, or a rest-day card with "Train anyway", plus a week strip.
  - **History:** a list of logged workouts.
  - **Food:** a placeholder.
  - **Me:** settings (days, finisher days, equipment, sound, flash, stretch, accent color) and Export data (JSON).
- **Storage and offline.** Data lives in IndexedDB, with localStorage as a fallback. A service worker makes the app work offline after the first load.
- **Data model.** It already holds per-exercise progression state for Phase 2: rung, targets, ratings, pain flags, hidden exercises, and history.

## Known issues / fix next

1. **Not yet tested on a real iPhone.** Check on the phone:
   - The tone with the ringer on silent
   - The flash
   - Wake lock
   - Safe areas (notch and home bar)
   - Add to Home Screen install
   - Offline launch
2. **Audio session "playback" may pause other audio.** Music or a podcast from another app may stop when the tone plays. A possible fix is a setting to switch to "ambient", which mixes with other audio but respects silent mode.
3. **Ending early, then restarting.** After you end a workout early, Today offers "Start workout" again, and finishing that creates a second log for the same day. History will show both. A fix would merge them, or resume from the partial log.
4. **Workouts left open past midnight.** A workout left unfinished overnight is saved as partial with a duration of 0.
5. **Arm care is a fixed list for each day type.** It doesn't use its progression rung yet. Phase 2 should fix this.
6. **The Knee support ladder exists but isn't used.** Phase 2 swaps it in after a pain flag.
7. **A/B alternation only advances after a completed workout.** A partial workout doesn't flip it.
8. **Session times are estimates,** at about 3 s per rep (more for tempo moves). Adjust after timing a few real sessions.
9. **Updates apply on the next launch.** There's no "update ready" prompt.
10. **Export only, no import.** Restore comes in Phase 4.
11. **Possible spec slip:** the spec's Phase 3 five-day schedule leaves out Wednesday. Confirm it before Phase 2.

## Deploy steps (not done yet)

1. On github.com, click **+** → **New repository**:
   - Name: `workout-app`
   - Visibility: **Public**
   - Leave "Add a README" unchecked.
2. From this folder:
   ```
   git remote add origin https://github.com/YOUR-USERNAME/workout-app.git
   git push -u origin main
   ```
3. In the repo, go to **Settings → Pages → Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main**, folder **/ (root)**
   - Click **Save**.
4. Wait about a minute (deploy progress shows on the **Actions** tab). Then open `https://YOUR-USERNAME.github.io/workout-app/` in **Safari** on the iPhone and tap **Share → Add to Home Screen**.
5. Open the app once while online so it caches for offline use.

**To redeploy later:**
1. Bump `CACHE_VERSION` in `service-worker.js`.
2. Commit and push.
3. On the phone, open the app, swipe it closed, and reopen it.
