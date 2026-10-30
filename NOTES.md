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
- **Where it's offered (v2.1.1, cache v6):**
  - Every session that isn't today's planned workout asks **Real workout** or **Practice (won't count)** first: Train anyway, Train again, and Start on an Extra workout card. Resuming an unfinished session never asks.
  - Choosing Real on Train anyway starts the session right away.
  - **Me → Start a practice run** works on any day. It uses today's plan if there is one.
- **Logs with no circuit sets don't count.** A workout ended before any circuit set (e.g. right after the warm-up) is still saved, so it shows in History. It doesn't:
  - Advance the A/B or day-type rotation
  - Ask for a check-in
  - Count toward the week count or the ramp
  
  This also applies to logs already on the phone, because these rules are recalculated from the logs.

## Update banner (v2.2.0, cache v7)

- **Waiting:** a new service worker installs in the background and waits instead of taking over on its own.
- **Banner:** when one is waiting, Today shows **Update ready, tap to reload** at the top. Tapping it tells the new version to take over, and the page reloads onto it.
- **Checking:** the app checks for a new version on launch and whenever it comes back to the foreground.
- **First install:** the very first install just caches, with no banner and no reload.

## Phase 3: tracking (v3.0.0, cache v8)

The math lives in `track.js` as pure functions. `app.js` handles the screens and storage.

- **Weekly weigh-in.**
  - **The prompt:** on Sundays, a "Sunday weigh-in" sheet drops in from the top when you open the app, so the keyboard never covers it.
  - **The field:** it starts empty, with "Last week: X lb" as a hint below it. It accepts a comma or a dot, and anything outside 50–700 lb shows an error.
  - **Dismissing:** **Skip** stops it asking for the rest of that Sunday. Tapping outside the sheet only closes it, so it asks again the next time you open the app.
  - **Turning it off:** use the switch at Me → Body.
  - **Extra entries:** you can add them any time from Me → **Add weigh-in**. Weight never appears on Today.
- **Me → Body:**
  - **Summary card:** the current weight, the change over the last 4 weeks, and the change since the start.
  - **Averaging:** the summary uses 4-week averages once there are 5+ weekly weigh-ins. Before that, it uses the latest vs the first.
  - **Chart:** plain SVG, so it works offline. It shows the last 12 weeks: a dot per weekly weigh-in plus the 4-week average line. Tap or hover a week to read its numbers.
  - **One point per week:** the Sunday entry, or the week's first entry if there was no Sunday one.
  - **Recent entries:** tap one to delete it.
- **Streak ("Never miss twice"):**
  - **Counting:** at most 1 workout per calendar day.
  - **Misses:** a single missed planned day doesn't break it, but 2 missed planned days in a row do. A day with only a partial workout doesn't add to the count, but it clears a pending miss.
  - **What never counts as a miss:** rest days, Saturdays, Brutal rest days, and today before it's over.
  - **What never counts at all:** warm-up-only logs and practice runs.
  - **Where it shows:** a flame chip on Today's week card, a stat on History (with "Don't miss next" after a miss), and the completion screen, where it ticks up.
- **History calendar:**
  - **Day states:** Done (green), Partial (amber ring), Missed (red dot), Planned (outline), and Today (accent ring). Days before your first workout are blank.
  - **Navigation:** ‹ › moves between months, from your first workout's month to now.
  - **Tapping a day** shows its workouts below.
- **Schedule history:**
  - A new `schedule` settings record keeps which workout days were in effect when. Past days use the days in effect then, so changing your days (or the ramp moving you up) never rewrites past weeks.
  - This fixes the old issue where ramp weeks used your current workout days.
  - On first launch of Phase 3, your current days stand in for all earlier history.
- **Storage:** IndexedDB version 2 adds a `body` store, and export includes it. Settings schema is now 3.

## Check-in redesign (v3.1.0, cache v9)

This replaces the Phase 2 check-in questions and rating rules above. The pain, "No time", knees, rest-day, and ramp-timing rules are unchanged.

- **Screen 1, "How did each one feel?"** One row per circuit and finisher exercise, each with Easy · Fine · Hard · Didn't finish.
  - Every row starts on Fine. A row with skipped or unstarted sets starts on Didn't finish, so a workout ended early uses the same screen.
  - Didn't finish opens Too hard / Pain / No time on that row. Picking a reason is optional, and no reason changes nothing.
- **Screen 2, "Overall?"** Good / Wiped out. **Screen 3:** "Knees today?" Practice adds the "What would change" preview.
- **Rules, pure double progression:**
  - Easy adds 1 step (1 rep, 5 s, or 1 conditioning point). Fine and Hard hold.
  - If every row is Fine, the exercise lowest in its range gets +1.
  - Wiped out takes 2 off every finished row (overriding Easy) and makes the next day a rest day.
  - Too easy and the 2-Too-easy rung shortcut are gone.
  - Arm care isn't rated: it gets +1 rep at the first check-in of each week where all its sets were done, unless that check-in was Wiped out.
- **In a row:** two check-ins in a row with a Hard row or Wiped out make the next workout lighter. Two Wiped out in a row on the same day type move those exercises down a rung.
- **Ramp:** a strong week is 80%+ done with at least one rated check-in and no more than one Wiped out. A rough week is under 60% done or 2+ Wiped out.
- **Old check-ins** (`v: 1`, rated 1–5) stay as saved. `Adapt.flags()` reads both kinds for every in-a-row rule and the ramp: Brutal counts as Wiped out, Hard counts as Hard, other ratings have no special effect, and a null rating is unrated. History shows old ratings with Brutal renamed Wiped out.

## Phase 4: polish (v4.0.0, cache v10)

- **Short on time.** Before you start, Today offers "Short on time? Do a 10-minute version".
  - The short version has 2 warm-up moves, the circuit at 2 rounds with at most 3 exercises (the push always stays), and 2 arm care drills. It has no finisher or stretch. More circuit exercises drop (never below 2) until it fits in 10 minutes.
  - "Use the full workout" switches back. It's a real workout: check-in, progression, streak, week, and ramp all work as usual. History marks it "10-min version".
- **Morning soreness check** (on by default; switch on Me). On a planned workout day, before anything is started, Today asks "Sore this morning?" Fine / A bit sore / Very sore.
  - Only **Very sore** changes anything. Today becomes "Mobility + arm care": warm-up, arm care, and the stretch, about 12 minutes. The day goes into `adapt.soreDates`, so it's no longer a planned workout day.
  - One-time changes the original plan used (lighter, shorter, knee swap) go back for the next workout. "Use the normal workout" undoes it, and the question isn't asked again that day.
  - **Done:** counts for the streak and shows as done on the calendar. It never asks for a check-in, and never counts toward the week, the ramp, or the day-type rotation.
  - **Skipped:** a rest day. It doesn't break the streak and doesn't add to it.
- **Backup.** Me → **Back up now** saves `workout-backup-YYYY-MM-DD.json` through the share sheet (Save to Files / iCloud Drive), then sets `settings.lastBackup`.
  - Me shows "Last backup: <date>", in amber after 14 days or if there's never been one.
  - On Sundays, Today shows a **Weekly backup** card at the top unless there's been a backup in the last 6 days. It's amber after 14 days, and "Not now" hides it until next Sunday.
- **Import.** Me → **Import data** picks a backup file and checks it: right app, not from a newer version, known stores, every record has its key.
  - A confirm sheet shows the backup's date and counts and warns that everything is replaced. Then `DB.importAll` replaces every store in one IndexedDB transaction, keeping record ids, and the app restarts.
  - The newer of the two "Last backup" dates (the phone's or the backup's) is kept. Older backups without a weigh-in store import fine.
- **Update banner:** already built in v2.2.0.

## Phase 5a: habits (v5.0.0, cache v11)

New records live in the `settings` store (no IndexedDB version bump), so backup and import carry them: `ledger` (skip tax) and `bank` (rewards). Settings are schemaVersion 5. The math is in `habits.js`, which has pure functions like `track.js`.

- **Just show up.** On a planned or extra day, before you start, Today offers "Just show up: 5 minutes" next to "Short on time".
  - It has 2 warm-up moves, 1 round of the push plus one more circuit move, and 1 arm care drill, trimmed until it fits in 5 minutes. The log gets `kind: 'minimum'`.
  - It counts for the streak (done or partial) and is never taxed. It gets no check-in and no progression, and doesn't count toward the rotation, the week count, or the ramp (`countsAsWorkout` leaves it out). The week strip shows the day with a green ring instead of a filled dot.
  - The plan's one-time changes (lighter, shorter, knee swap) go back for the next real workout. "Use the full workout" or "Do the full workout too" (after a 5-minute session) uses them up again.
- **Skip tax.** Owed is worked out from history, not stored: every planned day from `ledger.since` through yesterday with no show-up costs $5, minus payments.
  - `since` is the install day, so nothing before Phase 5a is charged. Turning the tax off and back on starts a fresh ledger.
  - **Paid** records a payment for the full amount. A payment covers every miss before its date.
  - **Excuse** (Sick or Travel, 2 per calendar month) is available from Today ("Sick or traveling? Excuse today") or from a missed day on the History calendar (within 14 days, not yet paid for).
  - An excused day stops being a planned day (`isPlannedDay`), so it's never a miss for the streak, the week, the ramp, or the tax. Excusing today removes the plan and gives back its one-time changes. The calendar shows excused days struck through, with Undo.
- **Wife notice.** It's due when floor(owed / $20) is more than `ledger.noticesSent`. Paid resets the count.
  - Today shows a red **Notify her** card. With no number set, it shows **Set up** instead.
  - The button is an `sms:` link with the message filled in (`{amount}` becomes the amount owed). The app can't tell whether the text was sent, so after Messages opens the card asks **Sent it** / **Open again**.
  - Me → Habits → **Skip tax and text settings** edits the amount, the excuse limit, the threshold, her name, her number, and the message.
- **Reward bank.** 10 points for a finished workout. 5 for a 5-minute workout, a mobility day, or a partial with circuit sets. Only the best one counts each day, from `bank.since` (install day).
  - Me → Rewards shows the balance and your rewards. You can add, edit, or delete them (tap the name), and **Cash in** is disabled until you can afford it.
  - Cash-ins are listed in History under "Rewards cashed in". The completion screen shows "+10 points".
- **Weekly scorecard.** On Sundays, Today shows it at the top until **Got it**. It covers the week that just ended.
  - It shows workouts done / planned, the streak, skip tax owed, and points.
  - It has an 8-week chart of weekly completion % with the average line and dashed upper/lower limits (XmR: average ± 2.66 × the average week-to-week change, kept between 0 and 100). Weeks before your first log and weeks with nothing planned are left out.
  - It takes over the Sunday backup card: **Back up now** and the Last backup line (amber after 14 days) show on the scorecard unless there's been a backup in the last 6 days.
  - History shows the latest scorecard under "Last week". Win meal % was added in 5b.
- **Wake-up nudge.** README → Wake-up nudge. Shortcuts can't open a home-screen web app, and "Open URLs" opens Safari, which has separate storage. So the alarm automation shows a notification instead.

## Phase 5b: food and desk (v6.0.0, cache v12)

IndexedDB version 3 adds a `daily` store, one record per date: `{ date, meals: { breakfast, lunch, dinner, snacks: [] }, protein, proteinAdds, lunchPlan, lunchStuck, deskBreaks, stood }`. Each meal is `{ rating: 'win' | 'ok' | 'miss', note, at, fastFood }`. Export includes it, and older backups without it import fine. Settings are schemaVersion 6. The math is in `food.js` (pure functions).

- **Food tab.**
  - **Protein:** a ring, +20 / +30 / +40 g, and Undo for the last add. The target was 150 g; v6.1.0 makes it 135 g (see below).
  - **Meals:** Breakfast, Lunch, Dinner, and any snacks, each with Win · OK · Miss. Tapping the selected rating clears it. **Note** adds a note. A snack's **Edit** can delete it.
  - **Dock:** "Log breakfast/lunch/dinner" for the meal that fits the time (lunch from 10:30, dinner from 3:30). It opens Win / OK / Miss and goes away once that meal is rated.
  - **Fast-food game plan:** places with a better order. Tap one to see the order. "Ordered it" logs the current meal as OK, so it's never a Miss or taxed.
  - **Meals vs. weight:** up to 12 weeks, from the first week with a rated meal. Weekly Win meal % as bars, with weekly weigh-ins as a line (right axis). It starts in the second week.
- **Lunch pre-commit.**
  - Opening the app at or after 8 p.m. (setting) shows "What's lunch tomorrow?" from the top. It offers the go-to lunches (3 to start, up to 6, edited on the Food tab), "No plan, I'll wing it", or free text.
  - Skip stops it for the night. Tapping outside only closes it, so it asks again next time. It never asks if tomorrow already has a plan. The Food tab's "Tomorrow" row sets or changes it any time.
  - The next day, the Lunch row shows the plan. Once lunch is rated, "Did you stick to it?" Yes / No shows, except after winging it. The dock's quick log asks it as a follow-up.
  - After 4 weeks (`lunchPromptSince`), Today asks "Keep the evening lunch prompt?" with the stuck-to-it count. Turning the prompt back on in Me restarts the 4 weeks.
- **Points:** +5 per Win meal (snacks too) and +2 per desk break, on top of the best workout of the day (`Habits.bank` extras). They never count for the streak, the week, or progression.
- **Miss-meal tax:** +$2 per Miss meal on the same ledger, counted as soon as it's logged, from `ledger.since`. It has its own switch, shown when the skip tax is on. The $20 text includes it. Payments now save a time (`at`), so the "You owe" line can tell which Miss meals came after a payment.
- **Today:** a card under the week with protein (tap for Food), desk breaks "n of 3" with **Moves** and **Did one**, and a "Stood for 2+ hours" check. Desk breaks and the stand check show Mon–Fri only.
- **Scorecard:** adds Win meals % for last week ("–" if nothing was rated).
- **History:** a tapped day also shows a "Food and desk" line: meals, lunch plan, protein, desk breaks, stand.
- **README:** a "Desk break reminders" section (Clock alarms or a Shortcuts Time of Day automation).


## Goal mode and protein 135 (v6.1.0, cache v13)

Settings schemaVersion 7. No IndexedDB change; meal ratings and daily records are untouched.

- **Protein:** the default is 135 g. Upgrading from schema 6 turns a saved 150 (the old default) into 135; any other number was set by hand and stays.
- **Quick-picks** under +20 / +30 / +40: chicken breast 4 oz cooked +35, turkey 4 oz cooked +30, egg whites 1 cup +26, Greek yogurt 1 cup +23, tuna 1 can +27, shrimp 4 oz cooked +24, cottage cheese 1 cup +25, protein shake 1 scoop +25. They save like the buttons (a number in `proteinAdds`), so Undo works the same.
- **Goal mode** (Me → Food and desk): Lose fat (default) / Maintain / Build. Changing it sets protein to the mode's default (135 / 135 / 150) and restarts the checkpoint clock. The Food tab's meal card opens with the mode's Win hint. The plan generator never reads the mode.
- **Checkpoint:** `goalSince` (set to the install day on first run) + `goalCheckWeeks` (12). When due, Today shows only "12-week check-in ready" with Open: no weight on Today. The sheet shows the 4-week average then vs now and levels gained (rung-ups in saved check-ins since `goalSince`), with Keep going / Maintain a few weeks / Switch mode. Maintain a few weeks = Maintain for 4 weeks, then the card offers "Back to <previous mode>".
- **Guardrail** (Lose fat only): with 5+ weekly weigh-ins and the latest within 14 days, if the 4-week average falls more than 1% of body weight a week, Today shows "Losing fast — eat a bit more to protect muscle". Got it hides it until next Sunday.
- The math is `Food.checkpoint` and `Food.lossRate` in `food.js`.

## Known issues / fix next

1. **Phase 3 not yet tested on the iPhone.**
2. **Audio session "playback" may pause other audio.** Music or a podcast from another app may stop when the tone plays. A possible fix is a setting to switch to "ambient", which mixes with other audio but respects silent mode.
3. **Ending early, then restarting.** After you end a workout early, Today offers "Start workout" again, and finishing that creates a second log for the same day. History will show both. A fix would merge them, or resume from the partial log.
4. **Workouts left open past midnight.** A workout left unfinished overnight is saved as partial with a duration of 0.
5. **Session times are estimates,** at about 3 s per rep (more for tempo moves). Adjust after timing a few real sessions.
6. **Missed check-ins stay unrated.** A check-in skipped with Later and never done by midnight stays `null`. Starting "Train again" before checking in also leaves the earlier session unrated.
7. **The "Which ones, and why?" list can be long** after ending early, because it lists every unfinished exercise, including arm care. You can skip any of them.
8. **Excuses after paying.** A missed day that's already been paid for can't be excused. Paid has no undo, so excuse sick days before tapping Paid.
9. **The skip tax counts only after install.** Misses before Phase 5a, or while the tax was off, are never charged.
10. **Changing a Miss meal after paying.** Re-rating an already-paid Miss as Win or OK lowers the charge, so the next misses are covered until the overpayment is used up.
11. **Food is logged for today only.** There's no way to rate a past day's meals or add a forgotten desk break.
12. **`adapt.test.js` is stale.** Its first case still uses the v1 "Too easy" rating, which the check-in redesign removed.

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
3. On the phone, open the app while online. Within a few seconds Today shows **Update ready, tap to reload**. Tap it. Swiping the app closed and reopening it also works.
