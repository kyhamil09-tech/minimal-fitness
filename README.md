# Minimal Fitness

A privacy-first fitness tracker that runs entirely in the browser (installable as a PWA). There is no account,
no server and no analytics: everything you log is stored in your own browser's `localStorage`.

## What it does

| Area | Features |
| --- | --- |
| **Today** | Real weekly totals, step/calorie/water/workout goal rings, streak, today's plan day, 1-tap micro-workouts |
| **Exercise** | Live GPS tracking (distance, pace, elevation, route map), strength logger (exercise library, sets/reps/weight, rest timer, personal records), manual logging, workout plans (Full Body, PPL, Run Base) and saved routines, share/delete, heart-rate zones |
| **Nutrition** | Calorie + macro tracking, 40-item food database, recent foods, custom foods, optional barcode lookup, water tracking, daily calorie target from your profile |
| **Fasting** | Protocol timer with history |
| **Sleep** | Sleep log with stage breakdown |
| **Progress** | Week/month/year charts, body weight & measurements, BMI, goal progress, streaks, achievements, personal records |
| **Settings** | Profile & units (metric/imperial), goals, reminders, Bluetooth heart-rate sensor, backup/restore/export, themes |

### Real vs. simulated data

Being honest about what is and isn't measured:

* **Real:** GPS distance/route (phone location), heart rate from any standard Bluetooth LE sensor (Web Bluetooth),
  everything you type in, all calculations derived from it.
* **Entered by hand:** steps (browsers can't read a step counter), sleep, body measurements.
* **Estimated:** calories burned (MET x weight x time), average HR when no sensor is connected (from effort), max HR
  (Tanaka), BMR/TDEE.
* **No demo data:** a new install starts completely empty (no workouts, sleep, fasts or health numbers). Screens show
  "—" until you log something or connect a sensor. Earlier builds seeded sample history; that is removed automatically
  on launch (anything you logged yourself is kept).
* Without a connected sensor there is no live heart-rate number (it shows "—"), never a made-up one.

Out of scope: cloud accounts, cross-device sync, friends/leaderboards, reading Health Connect. Use
**Settings > Backup, Restore & Export** to move data between devices.

## Pixel Watch live heart rate (Android app)

The Android app links to a Pixel Watch (any Wear OS 3+ watch) over the Wear OS Data Layer:

```
Watch: Health Services heart-rate sensor --> foreground service --> message /ky/hr
Phone: WatchHeartRatePlugin (Capacitor) --> "heartRate" event --> Today / Heart Rate / workouts
```

1. Pair the watch with the phone in the Pixel Watch app.
2. Build both APKs (phone and watch use the same `applicationId` and must be signed with the same key; building both
   on one machine uses the same debug key):
   ```bash
   npm run build && npx cap sync android
   cd android && ./gradlew :app:assembleDebug :wear:assembleDebug
   ```
   Outputs: `android/app/build/outputs/apk/debug/app-debug.apk` (phone) and
   `android/wear/build/outputs/apk/debug/wear-debug.apk` (watch).
3. Install the phone APK normally. Install the watch APK over Wi-Fi debugging: on the watch enable
   *Settings > System > About > tap Build number 7x*, then *Developer options > Wireless debugging > Pair new device*,
   then `adb pair <ip:port>`, `adb connect <ip:port>`, `adb -s <watch> install wear-debug.apk`.
4. Open **Minimal Fitness** on the watch, allow the sensor permission, tap **Start**. Heart rate appears in the phone app
   (Today, Heart Rate, and recorded workouts) within a few seconds. In the phone app, Settings > Heart-Rate Sensors
   shows the link status and has an "Ask watch to start" button (works once the sensor permission is granted).

## Watch app (Wear OS)

A full workout app, modelled on Strava and Google Health's watch apps:

* **12 workouts:** Run, Treadmill, Walk, Hike, Cycle, Indoor bike, Row, Strength, HIIT, Bodyweight, Elliptical, Yoga (plus
  heart-rate-only). Outdoor sports record GPS on the watch itself (distance, pace, elevation, route).
* **Live pages (swipe):** Metrics (timer, heart rate with zone, distance / pace or calories) - Controls (pause, lap, end) -
  Heart-rate zones (time in each zone, average and max) - Laps (current lap and recent laps with pace and heart rate).
* **Automatic:** auto-pause when you stop moving, auto-lap every km or mile with a haptic buzz, optional zone alerts
  (vibrate in or out of zone 5). Toggle these under *Workout settings* on the watch.
* **Ending:** *Save / Resume / Discard*, then a summary (time, distance, pace, heart rate, calories, climb, zones).
* **With or without the phone:** with the phone nearby the two share one workout (start, pause, stop from either). If the
  phone is left at home the watch records everything itself, and the workout (route, heart rate, laps) is sent to the phone
  automatically the next time they connect and appears in your history with its map and breakdown.
* The screen follows the system timeout to save battery; the ongoing-activity chip and the watch-face complication bring
  you back to the workout.

## Watch face options

Long-press the face > Edit: five complication bubbles, accent colour (heart rate), battery-ring colour, time colour, label
and complication colours, **background glow palette** (App glow, Vivid, Soft, Aurora, Sunset, Ocean, Forest, Rose, Mono, Black)
and **glass style** (Frosted, Clear, Minimal, Smoked, and tinted glass). The face is generated by
`android/watchface/generate-watchface.ps1`; edit the palettes there and re-run it.
### Watch face

`android/watchface` is a Watch Face Format face (declarative XML, no code; needs Wear OS 4+, i.e. Pixel Watch 2/3, or
Pixel Watch 1 updated to Wear OS 4). It is pure black (AMOLED) with liquid-glass bubbles: time, date, battery ring, live heart rate and five editable complication slots.

```bash
cd android && ./gradlew :watchface:assembleDebug     # android/watchface/build/outputs/apk/debug/watchface-debug.apk
adb -s <watch> install watchface-debug.apk
```

Then long-press the watch face > swipe to **Minimal Fitness**. To show your running workout timer, long-press the face >
Edit > tap any of the five bubbles > **Minimal Fitness workout** (provided by the watch app, so install `wear-debug.apk` too).
Ambient mode shows only a thin time. Heart rate on the face is the watch's own reading (not updated in ambient mode).

### Workouts on phone and watch together

Start a workout on either device; both follow it.

| | Phone | Watch |
| --- | --- | --- |
| Start | Move tab > Start Run/Walk/Cycle/Hike/Strength (opens the watch app and starts its sensors) | Start Run/Walk/Cycle/Hike/Strength (starts the same workout on the phone) |
| Pause / Resume | Pause button | Pause button (not for Strength) |
| Stop | Finish & Save (saves the workout, ends the watch exercise) | Stop, tap twice (ends the watch exercise and saves on the phone) |
| Shows | Timer, GPS distance, pace, HR and zone, calories | Timer, HR and zone, distance, pace, calories |

* The phone owns the workout record, the timer start time and GPS distance/pace; the watch draws its timer from the
  phone's start time so the two never drift.
* Calories and heart rate are measured by the watch (Health Services exercise session). Without a watch, calories are
  estimated on the phone and the average heart rate is estimated from effort.
* The watch runs a real Wear OS exercise session (screen-off safe, shows as an ongoing activity) and keeps its own
  list of recent workouts on the watch. These are stored in the Minimal Fitness watch app only; they are not written to
  Fitbit, Google Fit or Health Connect.
* Without the phone nearby, a workout started on the watch still runs and is saved in the watch's history.
* Keep the watch within Bluetooth range. Steps and sleep are still entered by hand.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build    # production build (registers the service worker for offline use)
npm run lint     # type-check
npm test         # unit tests (node:test via tsx)
```

GPS, Bluetooth and notifications need a secure context: `localhost` or HTTPS.

## Automatic data, backup and run features

**Steps and sleep (Settings > Automatic data)**
* Steps are counted automatically by the phone's hardware step counter (works with the screen off) and by the Pixel
  Watch (sent to the phone once a day total updates). The highest source wins, so a number you type is only used when
  it is higher. Health Connect steps are included if you connect it.
* **Health Connect** (read-only) imports your watch's sleep sessions with measured stages, and steps, from
  whichever app syncs to it (Pixel Watch / Google Health / Fitbit). Imported nights never overwrite a night you logged
  by hand. Naps under 90 minutes are ignored.

**Automatic backup (Settings > Automatic backup)**
* Pick a folder once (choose one inside Google Drive to keep the backup off the phone). The app writes a dated JSON
  backup once a day and shortly after each new workout, keeping the last 7. **Restore latest** replaces the app's data
  from the newest backup, for example after reinstalling.

**Run features**
* **Live map** while a GPS workout runs, **auto-pause** (stops the clock after ~6 s standing still, resumes when you move),
  **spoken updates** every kilometre or mile (lap time, pace and optionally heart rate; they keep playing with the screen
  off) and a **Lap** button. Turn them on in Settings > Run options.
* **Running records**: fastest 1 km, 1 mile, 5 km, 10 km and half marathon are found automatically from recorded runs
  (shown on the Move tab), and a run that sets one is flagged "New PR" in its breakdown.
* Moving time excludes time you stood still, so pace and splits reflect running, not waiting at lights.

**Editing a workout**: open a workout's breakdown and tap **Edit** to change its type, notes, effort or calories, or to
**trim** the start or end of a recorded route (distance, time, climb, heart rate and calories are recalculated).

**Widget and tile**: a home-screen widget shows steps and weekly progress with one-tap Run / Walk. The watch has a tile with
steps and one-tap Run / Walk / Ride (add it by swiping to the end of your tiles and tapping +).

**Appearance**: Settings > Display > Appearance switches between Dark, Light and Auto (follows the phone).

**Diagnostics**: crashes and screen errors are kept only on the device; Settings > Diagnostics shows and shares them.

**Signing key**: every APK is signed with `signing/ky-fitness-signing.keystore`. Android only installs an update over an
existing app if it is signed with the same key, so keep a copy somewhere safe (see `signing/README.txt`).
## Workout breakdown and route map

Every finished workout opens a full breakdown (also available from **Move > any past workout > Route map and full
breakdown**):

* **Route map** (OpenStreetMap, with Dark / Street / Satellite) with the line coloured by speed, start and finish markers.
* **Open in Google Maps** (a walking or cycling route through your recorded points, up to 10 stops so it is approximate),
  **Export GPX** (exact route with time, elevation and heart rate; opens in Strava, Garmin Connect, Komoot, Google Earth)
  and **Share**.
* Time and moving time, distance, average pace or speed, best split, calories, climb and descent, average and max heart rate,
  cardio load, effort.
* **Kilometre or mile splits** with pace, elevation change and average heart rate per split.
* **Heart rate** over time and **time in each zone**; **speed** and **elevation** charts.
* Strength sessions list every exercise with its sets, reps and weights, plus total volume.

Recording is done natively in the Android app by a foreground location service, so the route and heart rate keep recording
while the screen is off and the phone is in your pocket (a notification shows while it runs). Location permission is
requested when you start a GPS workout. In a browser tab the page's own geolocation is used, which needs the screen on.
Workouts saved by older versions keep working and show whatever they recorded.
## Strength, coaching, cycling and safety

* **Strength progression:** each exercise in the logger says what to lift next (double progression: add reps until every set
  reaches the top of the range, then add the smallest jump), with a plate calculator for barbell lifts. Progress > Awards has
  estimated one-rep max per lift over time and hard sets per muscle group each week.
* **Spoken coaching:** besides lap and interval cues, distance and time goals say halfway, three quarters, the last
  kilometre or mile and the last minutes, and a pace target says how far off you are ("Speed up, 15 seconds per kilometre behind").
* **Cycling sensors:** Bluetooth power meters and speed or cadence sensors (up to two at once). Live watts, rpm and speed;
  average, normalised power, best 20 minutes, power zones and a power-based load (set threshold power in Settings > Run, or
  leave it on Auto).
* **Recovery:** each finished workout says how hard it was for you (against your last month) and about how long to give it.
* **Workout suggestions:** the phone notices a run or ride (and optionally a walk) and offers to record it; it never starts by itself.
* **Live share:** optional safety texts with a map link, by SMS. See PRIVACY.md.

## Food search

* **A big offline database:** about 13,000 foods from the US government's USDA FoodData Central (SR Legacy and the FNDDS survey
  foods, public domain) are bundled in the app, with calories, protein, carbs, fat, fibre, sugar and sodium per 100 g and the usual
  portions ("1 cup", "1 slice"). Rebuild it with `node tools/build-food-db.mjs <folder with the two unzipped USDA CSV folders>`.
  It loads in the background the first time you open Add food, so the app still starts as fast as before.
* **Search that forgives:** matches the start of words as you type, tolerates typos ("chiken brest"), knows British and American
  names (yoghurt, aubergine, courgette, porridge), and ranks plain everyday foods first, with what you eat often and your
  favourites on top.
* **Fast logging:** the + on any row adds the usual portion in one tap with an Undo; tap the row to choose the amount (portions,
  grams or ounces), see the calorie and macro donut and the finer detail, and pick the meal. Recent foods, favourites (star),
  your own foods and saved meals have tabs, and the sheet stays open so you can add several things in a row.
* **Packaged foods:** "Search packaged foods online" looks up brands on Open Food Facts when you tap it (only the words you typed
  are sent). Scanning a barcode sends only the number.

## Look, onboarding and sharing

* **Backgrounds:** a soft off-black (Charcoal) is the default and AMOLED black is an option, with Midnight slate, Deep sage, Dusk
  plum, Deep ocean and Espresso, plus eight light and pastel backgrounds (Warm cream, Alabaster, Sage mist, Blush, Lavender, Soft
  sky, Sand, Apricot) and your own colour. Text is a warm cream or a warm charcoal, never pure white or black. The drifting glow
  works on all of them. Settings > Look & feel > Colours & background.
* **Palettes:** Grounded Sage (sage, cream, terracotta), High-Energy Slate (lime and blood orange), Mind & Body (rose, lavender,
  gold) and Calm Ocean, each with its own chart colours, next to the bold originals and your own palettes.
* **Onboarding:** four quick screens: pick a look (applied live), pick a goal, a few numbers with sliders, and a small
  celebration. Every answer is pre-filled, so it takes under a minute.
* **Motion and touch:** a light tick on every button (switch off in Settings > Run), rings that fill when they appear and pulse once
  when they close, and soft pop-in animations. Reduce motion turns the motion off.
* **Story cards:** Progress > Awards and the Weekly recap make 9:16 pictures (week, streak, milestone badge) in your current look.
* **Watch:** the watch app and its tile use the same palette and a dark version of your background (sent over the Bluetooth link to
  your watch, nothing online). The watch face has the same palettes plus a Background setting in its editor.

## Desktop viewer

`npm run viewer` builds `dist-viewer/ky-fitness-viewer.html`: one file that opens from disk in any browser, offline. Open a backup
(plain or passphrase-encrypted) from Settings > Backup and it shows a full-year heatmap, side-by-side run comparison, long sleep and
HRV trends, fitness/fatigue/form, repeated routes, the insights engine over all history, and CSV / GPX export. The page carries a
policy that forbids every network connection, so the file cannot leave your computer. It reuses the app's own analysis code in `src/lib`.

## Data & privacy

* All data lives under `kyfit_*` keys in `localStorage` (theme keys use `aegis_*`).
* Network requests the app can make: the optional barcode lookup (sends just the barcode number to [Open Food Facts](https://world.openfoodfacts.org)), and map tiles when you open a workout's route map (the tile server sees which area you view, not who you are or what you did). Street and dark maps use OpenStreetMap tiles; Satellite uses Esri. Your route itself is never uploaded.
* Reminders are local and only fire while the app is open or running in the background.
* Each install holds only its own user's data. **Settings > Erase all my data** returns the app to first-run setup.

## Project layout

```
src/
  lib/          pure logic (calc, units, dates, trends, backup, geo, barcode, achievements) - unit tested
  hooks/        usePersistentState, useGeoTracker, useBleHeartRate, useReminders
  components/   screens and modals
  data/         exercise library, plans, foods, defaults, sample data
  __tests__/    node:test suites
public/         manifest, service worker, icon
```


## Added in this round

* **Steps:** Settings > Health data > Steps lets you count with Best of all, Phone, Watch or Health Connect (the phone's counter is switched off when it is not a chosen source). Any day can be edited or deleted, and **Remove steps from a period** takes the steps counted between two times out of a day (a drive, say). It needs timed samples, which the Android app keeps from now on: the phone about every 15 minutes, the watch each time it reports, Health Connect by the hour.
* **Health Connect is optional:** Settings > Health data > Use Health Connect. Off means nothing is read, written, deleted or asked for. Each workout remembers whether it reached Health Connect, and workouts that never did can be sent later (last 90 days, never imported ones).
* **Health tiles open history:** tap Steps, Water, Heart rate, Calories eaten or any Health Connect number on Today for a 7, 30 or 90 day chart with averages, best day and trend.
* **Progress > Calendar:** a month of workouts with the plan's days and the ones that slipped by. **Progress > Trends** now has Nutrition (calories and protein against your targets, macro split, on-target days) and a **Weekly coach** (score, a verdict per area and what to do next week).
* **Meal plan and groceries:** Food & water > Meal plan and groceries. Plan a week from saved meals, log a meal in one tap, and get a shopping list from the plan.
* **Supersets and circuits:** in the strength logger, tap "Superset with next" between exercises. No rest between them, rest after the last of the round, on the phone and on the watch.
* **Best-signal GPS:** the watch also uses Fused Location as a fallback, sends its route at the end of a shared workout, and the phone fills gaps in its own route from it.
* **Water:** a home-screen Water widget (one-tap add without opening the app) and a watch **Fuel** tile (water and the running fast). Water added there is logged the next time the app runs.

The Android changes (steps by time, Health Connect hourly steps, watch fallback location, the water widget and tile) were written without a build toolchain on the development PC, so build and try them on a device before relying on them.
