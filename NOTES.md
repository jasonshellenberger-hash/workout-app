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

## Phase 1 fixes (v1.0.1, cache v2)

From the first workout on the iPhone:
- **Audio.** The app resumes the AudioContext when you come back to it and before every tone. If iOS left it suspended or interrupted, the next tap unlocks it again. The audio session is set to "playback" each time. Me shows a debug line under Test sound and flash with the AudioContext state, audioSession support, and the last tone.
- **Auto-pause.** Tapping Watch demo pauses the timer before the link opens. Leaving the app also pauses it. When you come back, the Paused screen stays up until you tap.
- **Flash.** The whole screen flashes in the accent color: 2 pulses of 300 ms when a timer ends, and again when the workout is done (with a done tone). A Flash strength setting (Subtle or Bold, default Bold) is under Me → Workout.

- **Train again (v1.0.2, cache v3).** Once today's workout is done, Today shows a "Train again" link. It starts a fresh run of today's plan, with the same exercises and day type. Each extra session saves its own log, which shows in History but doesn't add to the week count. If you leave an extra session unfinished, the link reads "Resume extra session".

## Phase 2: adaptation (v2.0.0, cache v4)

The rules live in `adapt.js` as pure functions. `app.js` handles the screens and storage.

- **Check-in after every workout.** It asks "Did you finish everything?" and then one of two paths:
  - **Yes:** "How hard was it?" (1–5).
  - **Not all:** "Which ones, and why?" (Too hard / Pain / No time for each unfinished exercise), then "How was the rest?" for the exercises you did finish.
  - Both paths end with "Knees today?".
  - A workout ended early starts at the reasons step.
  - **Later** skips the check-in, and Today shows a **Check in** button until midnight.
- **Progression is pure double progression, per exercise.**
  - Easy adds 1 rep, Too easy adds 2, and timed holds move 5 s per rep.
  - Past the top of the range, the next usable rung starts at the range minimum.
  - 2 Too easy ratings in a row on the same exercise move it up a rung right away.
  - Just right holds, with +1 rep on whichever exercise is lowest in its range. Hard holds.
  - Brutal takes 2 reps off (never below the minimum) and makes the next day a rest day.
  - Arm care progresses reps only (10–15).
  - Conditioning has no reps, so Easy and Too easy earn 1 and 2 points. Past 2 points, it moves to the next rung.
- **Workout-level rules:**
  - 2 Brutal ratings in a row on the same day type take every exercise in that day type down a rung.
  - 2 Hard or Brutal ratings in a row make the next workout lighter: 2 reps off and no finisher.
  - "No time" drops one circuit exercise (never the push) and the finisher from the next workout.
  - Knees rated Sore or worse on 2 check-ins in a row make the next workout with leg moves take 2 reps off those moves.
- **Pain flags:**
  - On a lower-body move, that slot uses the Knee support ladder in the next workout that includes it.
  - On an upper-body move, the exercise goes down a rung.
  - A 2nd flag on the same exercise within 4 weeks hides it for 14 days.
- **Unrated logs:** a log with `checkIn: null` (every Phase 1 log, or a skipped check-in) never moves anything, and every "in a row" rule skips it.
- **Day types:**
  - Training phase 1 keeps Full Body A/B.
  - Phases 2–3 rotate Upper → Lower → Full Body + Conditioning, which always has the finisher.
  - Every day type has a push move.
  - The rotation now advances after any workout with sets done, including partial ones.
- **Ramp from 3 to 5 days:**
  - **Strong week:** 80%+ of planned workouts done, plus an average rating of Just right or easier from at least 1 rated workout.
  - **Moving up:** after 2 strong weeks in a row, Today offers **Move up** (to Sun/Mon/Wed/Fri, then Sun/Mon/Wed/Thu/Fri) or **Not yet**.
  - **Dropping back:** phase 3 offers to drop back after 2 rough weeks (under 60% done, or an average of Hard or worse).
  - **Counting:** only weeks starting on or after the current phase began count. Phase 2 starts that clock on the day it's installed.
- **Plan notes:** Today's workout card says why a plan was changed, e.g. "Lighter today after two hard sessions".
- **History, Level up, and Me:**
  - History shows each rating, knees, and any level-ups.
  - A **Level up** card shows the old → new exercise.
  - Me shows the training phase, progress toward the next one, and each ladder's current exercise and target.
- **Schedule correction:** the spec's 5-day schedule (Sun, Mon, Wed, Thu, Fri) leaves out **Tuesday**, not Wednesday as an earlier note said. That's fine, because back-to-back days always get different day types.

## Practice mode (v2.1.0, cache v5)

- **Choosing it:** on a rest day, **Train anyway** asks **Real workout** or **Practice (won't count)**.
- **What it runs:** the full flow, including the timers, completion screen, and check-in. A **PRACTICE** badge shows in the player, on the completion screen, and in the check-in.
- **The ending:** instead of saving, the check-in ends on **What would change**, e.g. "Next time: Push-up 13" or "Level up: A → B".
- **Nothing is saved:**
  - No log, plan, or session record.
  - No progression change.
  - Queued one-time changes aren't used up. A practice plan shows them, but the next real workout still gets them.
  - No rotation advance, and no effect on the week count or ramp.
- **Ending early:** ending a practice run early goes to the reasons step and the same preview.

## Known issues / fix next

1. **Phase 2 not yet tested on the iPhone.**
2. **Audio session "playback" may pause other audio.** Music or a podcast from another app may stop when the tone plays. A possible fix is a setting to switch to "ambient", which mixes with other audio but respects silent mode.
3. **Ending early, then restarting.** After you end a workout early, Today offers "Start workout" again, and finishing that creates a second log for the same day. History will show both. A fix would merge them, or resume from the partial log.
4. **Workouts left open past midnight.** A workout left unfinished overnight is saved as partial with a duration of 0.
5. **Session times are estimates,** at about 3 s per rep (more for tempo moves). Adjust after timing a few real sessions.
6. **Updates apply on the next launch.** There's no "update ready" prompt.
7. **Export only, no import.** Restore comes in Phase 4.
8. **Missed check-ins stay unrated.** A check-in skipped with Later and never done by midnight stays `null`. Starting "Train again" before checking in also leaves the earlier session unrated.
9. **Ramp weeks use your current workout days.** Changing your days mid-phase changes how many workouts past weeks count as planned.
10. **The "Which ones, and why?" list can be long** after ending early, because it lists every unfinished exercise, including arm care. You can skip any of them.

## Deploy steps (not done yet)

0. **Before first push:** set this repo's user.email to the GitHub noreply address and rewrite the existing commits.
   ```
   git config user.email "ID+USERNAME@users.noreply.github.com"
   git rebase -r --root --exec "git commit --amend --no-edit --reset-author"
   ```
   Check with `git log --format="%an <%ae>"`. Every commit should show the noreply address.
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
