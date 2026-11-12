# Minimal Fitness: Google Play publishing guide

Prepared 2026-10-12 from the current code and manifest. Everything below says what the app really does. Check each answer against
the app before you submit, and re-check the Play Console wording on the day, because Google changes its forms. This is not legal advice.

## 1. Is it ready? (short answer: close on features, not yet on paperwork)

**Ready:** targets Android 16 (API 36), one native library (the ML Kit label reader, `libmlkit_google_ocr_pipeline.so`; the debug APK passes `zipalign -c -P 16`, so re-run that check on the release bundle for the 16 KB page-size rule), no cleartext traffic, no
cloud auto-backup, no SMS or call-log permissions, no background location, no advertising or analytics code, every outgoing request
is on one allow-list, privacy policy written (`PRIVACY.md`, now updated), licence added.

**Blockers (must fix before submitting):**
1. **Signing (build side done, key still to create).** Release builds now refuse to use the debug key and sign only with your upload key
   from `keystore.properties`. You still need to create that key and turn on Play App Signing. See section 8.
2. **Host the privacy policy at a public web address.** Play needs a URL, not a file. The page is built: run `node tools/build-privacy-page.mjs` and publish the contents of `store/privacy-site` (for example with GitHub Pages, in a small separate public repo). Fill in `[CONTACT EMAIL]` in `PRIVACY.md` first, then rebuild the page.
3. **Health Connect declaration.** Google reviews every Health Connect permission by hand. Section 3 has the text. Requesting 31
   permissions makes this the slowest step; trimming is suggested there.
4. **Store listing assets.** Missing: a 1024x500 feature graphic and real phone screenshots (only widget shots exist), plus Wear OS screenshots.
5. **Closed test.** A new personal developer account needs 12 testers opted in for 14 continuous days before production access.
6. **Real-device checks** you have not finished (see section 9). A reviewer or a tester who hits a broken feature costs you days.

**Worth doing, not blocking:** turn on code shrinking (`minifyEnabled`) after a full device test; drop `SCHEDULE_EXACT_ALARM` if you can live
with approximate reminder times (section 5); decide the final app name and package before publishing, because the package name
`com.kyfitness.app` can never change after the first upload.

## 2. Permission explainer

This is the plain-language list for the Play Console, the listing and the in-app privacy screen. "Asked" says when Android shows the pop-up.

| Permission | What it is for | When asked | Play form needed |
| --- | --- | --- | --- |
| `ACCESS_FINE_LOCATION` | Records the GPS route, distance and pace of a workout | When you start a GPS workout | None (foreground only) |
| `ACCESS_COARSE_LOCATION` | Roughly where you are for the optional run weather | With the location prompt | None |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` | Keeps recording the route when the screen is off, with a visible notification | Starts with the workout | **Foreground service declaration + demo video** |
| `ACTIVITY_RECOGNITION` | The phone's step counter, sleep detection and "looks like you started a run" prompts, all on the phone | When you turn on steps or detection | None |
| `BLUETOOTH_SCAN` (never for location) / `BLUETOOTH_CONNECT` | Heart-rate straps, cycling sensors, the watch | When you pair a sensor | None |
| `CAMERA` | Scan food barcodes, nutrition labels and challenge QR codes, and take progress photos with a guide, all on the phone. Scans are never saved or sent; progress photos stay in the app's private storage | First scan or photo | None |
| `RECORD_AUDIO` | Voice food logging, using Android's on-device recogniser only | First use of voice | None |
| `POST_NOTIFICATIONS` | Reminders, the workout notification, the fasting timer | First reminder | None |
| `POST_PROMOTED_NOTIFICATIONS` | Lets the fasting timer show as a live notification on Android 16 | Install time | None |
| `SCHEDULE_EXACT_ALARM` | Fires the fasting timer and reminders on the exact minute | Install time (Android may ask you to allow it) | **Exact alarm declaration** (see section 5) |
| `RECEIVE_BOOT_COMPLETED` | Puts reminders and the fasting timer back after a restart | Install time | None |
| `WAKE_LOCK`, `VIBRATE` | Keeps the phone awake during a workout; buzzes for goals | Install time | None |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Only the services in `PRIVACY.md`. A guard refuses any other host | Install time | None |
| `USE_BIOMETRIC` / `USE_FINGERPRINT` | Optional app lock | When you turn on the lock | None |
| Health Connect (`android.permission.health.*`) | See section 3 | When you allow each group | **Health Connect declaration** |

**Not requested, and worth saying in the listing:** background location, SMS, call log, contacts, accounts, storage, all-files access,
battery-optimisation exemption, advertising ID.

## 3. Health Connect declaration

In Play Console: **App content > Health apps** (declare the app as a health and fitness app) and **App content > Health Connect** (justify each
data type). The privacy policy URL is mandatory. Paste these, one per type. All use: *"Used only inside the app on this phone to show
the user their own data. Never sold, never used for advertising, never sent to the developer."*

**Read (receive):**

| Data type | Justification |
| --- | --- |
| Sleep | Show sleep stages and total sleep recorded by the user's watch or tracker, and combine nights from several trackers |
| Heart rate, resting heart rate | Show heart-rate trends, recovery and training zones |
| Heart rate variability, respiratory rate, oxygen saturation, skin temperature | Shown in the sleep and recovery screen as overnight measures |
| VO2 max | Show fitness level |
| Steps, distance, total and active calories, floors climbed | Daily activity totals and goals |
| Exercise | Bring in workouts recorded by other apps so they appear in the user's history |
| Weight, body fat, height | Body progress and calorie estimates |
| Blood pressure, blood glucose | Show readings the user chose to track |
| Read health data history | Import sleep and workouts from before the app was installed (more than 30 days) |

**Write (send; off by default and ticked per type by the user):**

| Data type | Justification |
| --- | --- |
| Exercise, distance, total calories, exercise route, heart rate | Save the user's workouts, with route and heart rate only if the user ticks them |
| Weight, body fat | Save weight the user logs |
| Nutrition, hydration | Save meals and water the user logs |
| Mindfulness session (`WRITE_MINDFULNESS`) | Save a finished guided-breathing session as a mindfulness session, only if the user ticks it. This record type is marked experimental by Google; on a Health Connect without it the app quietly saves nothing |
| Sleep | Save sleep the user logs or the phone detects (never sleep that came from Health Connect) |
| Blood pressure, blood glucose | Save readings the user logs |

**Review tips:** every permission in the manifest must be used by a real feature. If you would rather get approved faster, drop the ones
you can live without (skin temperature, floors climbed, oxygen saturation, respiratory rate) and add them back in a later update.
Reviewers also look for the in-app rationale screen (the manifest already has `ACTION_SHOW_PERMISSIONS_RATIONALE` and
`VIEW_PERMISSION_USAGE`; make sure the rationale screen text matches section 2).

## 4. Foreground service declaration (location)

Type: `location`. Text for the form:

> The app records the route, distance and pace of a GPS workout the user starts. The user presses Start, a persistent notification shows
> while it records, and it stops when the user ends the workout. The recording must continue when the screen is off or the app is in
> the background, otherwise the route would have gaps. Location is used only on the phone.

**Demo video (required):** screen-record starting a run, locking the screen for 30 seconds while the notification stays visible, unlocking, and
stopping. Upload it as an unlisted video and paste the link.

## 5. Exact alarms

Play only allows `SCHEDULE_EXACT_ALARM` for apps whose main job is an alarm, timer or calendar, and asks you to explain. The fasting timer
is a timer, and the code (`FastingNotifier.java`) already falls back to a not-quite-exact alarm when Android denies it. If you want zero
review risk, remove the permission and accept that reminders can be a few minutes late. If you keep it, use:

> The app has a fasting timer and meal reminders the user sets for a specific time. The user expects the notification at that minute.

## 6. Data safety form (draft answers)

Play counts data as "collected" when it leaves the phone, with exceptions for user-started transfers and data the developer cannot read.
Nothing here goes to the developer. These are the conservative answers; confirm each against Play's current help text.

- **Does the app collect or share user data?** Yes, the optional items below. No data goes to the developer or to advertisers.
- **Approximate location:** collected, optional, for app functionality (map tile requests and the optional run weather). Not shared. The app does not store it off the phone.
- **Search and barcodes:** food search words and barcodes go to Open Food Facts, optional, app functionality. If Open Food Facts has no answer, a tap on "Search USDA" sends only the barcode digits (and the user's own optional USDA key) to api.nal.usda.gov. User-started, app functionality, not linked to the user, not shared.
- **Recipe import:** when the user taps Get the recipe, native code downloads the one web page whose address the user typed or pasted (https only, public addresses only, no cookies, no identifiers). Nothing about the user is added. This is a user-initiated request; if the Console asks, it is not collected or shared, and the page is not stored.
- **Find a video:** opens a YouTube search or a saved link in a Chrome Custom Tab. The app sends nothing itself; the page is YouTube's (a separate service, under its own policy). Mention it in the privacy policy as done (see PRIVACY.md).
- **Label scanning and QR scanning:** processed on the phone (ML Kit bundled model, no network). Nothing collected.
- **Health and fitness info, precise location (routes), personal info:** leave off for the Google Drive backup if it is end-to-end encrypted with the
  user's passphrase and you cannot read it. Declare it if Play's wording for your case says encrypted backups still count. Strava uploads are
  user-started, so they are covered by the user-initiated exception.
- **Coach notes, calorie guide, measured maintenance and muscle recovery:** local notifications and on-device arithmetic only. Nothing is collected or sent. The guided progress-photo camera saves to the app's private storage only.
- **Friends and challenges:** nothing is sent by the app. Codes are shared by the user through Android's share sheet, so this is a user-started transfer.
- **Is all data encrypted in transit?** Yes (HTTPS only, cleartext disabled).
- **Can users ask to delete data?** Yes: Settings > Erase all my data, or uninstall. The developer holds none.
- **Data used for ads, or sold?** No.
- **Account creation / account deletion:** the app has no accounts of its own. Google sign-in is only for the optional Drive backup, so the
  account-deletion web form is not required.

## 7. Store listing

- **Name:** Minimal Fitness (check the name is free in the Play Store before committing to it)
- **Category:** Health & Fitness. **Tags:** fitness tracker, GPS, sleep, nutrition.
- **Short description (80 characters max):** `Private fitness tracker: workouts, GPS, sleep and food. No account, no ads.`
- **Full description (draft):**

  > Minimal Fitness tracks your workouts, sleep, food, water and fasting without an account and without sending your data to anyone.
  > Everything stays on your phone.
  >
  > - GPS runs, rides and walks with live pace, distance and route map, even with the screen off
  > - Pixel Watch and Wear OS companion with heart rate, auto-pause and a watch face
  > - Sleep from your watch, phone or several trackers at once through Health Connect
  > - Food and water logging, barcode and nutrition-label scanner, recipe import from a web address or pasted text, fasting timer and home screen widgets
  > - Lift: a plain, Hevy-style weightlifting log with routines, set types, supersets, rest timer, records and history, plus import from Hevy and Strong
  > - Swimming, skiing, snowboarding, ice skating, snowshoeing and paddling as well as running, cycling and gym
  > - Guided breathing sessions with gentle vibration cues
  > - Optional friends challenges with no accounts: share short codes or a QR code with friends and see a leaderboard
  > - Available in English, Spanish, French, German, Portuguese and Italian (the main screens; the rest stays in English for now)
  > - Charts, streaks and personal records
  > - Health Connect: receive data from your watch and other trackers, or optionally send your own, one type at a time
  > - Optional Google Drive backup, encrypted with a passphrase only you know
  > - Themes, including a clean white Google-inspired look and an animated galaxy
  >
  > Privacy: no ads, no analytics, no sign-in, nothing sent to the developer. Check it yourself in Settings > Privacy and data.
  >
  > Minimal Fitness is not a medical device and does not give medical advice. Talk to a doctor before changing your exercise or diet.
  > It is not affiliated with or endorsed by Google. Android is a trademark of Google LLC.

- **Graphics:** icon 512x512 (done: `store/icon-512.png`), **feature graphic 1024x500 (missing)**, at least 2 phone screenshots (take them in the
  default theme; avoid the widgets-only shots), Wear OS screenshots (required for the watch listing).
- **Contact email, website (privacy policy URL), phone number (optional for personal accounts).**

## 7b. Questionnaires

- **Content rating (IARC):** no violence, no gambling, no user-to-user chat or user-generated content. Location is shared only through a share link
  the user sends themselves. Expect a rating of Everyone / 3+. Answer the location-sharing question honestly; ask me if the wording is unclear.
- **Target audience:** choose **18 and over** (blood-pressure and glucose logging, and it avoids the child-directed rules). Not a Families app.
- **Ads:** none. **App access:** no login needed. **Government app / financial features / news:** no.
- **Health apps declaration:** yes, a health and fitness app, no medical-device claims.

## 8. Release steps in order

1. Decide the final name and keep the package `com.kyfitness.app` (permanent).
2. Create a **developer account** ($25 one-time, identity verification). If it is a personal account created after Nov 2023, plan the 14-day closed test.
3. Create an **upload keystore** on your own machine (the command below asks you for the passwords, so only you know them). Keep the file outside this
   project folder and back it up with its passwords in a password manager. Then copy `keystore.properties.example` to `keystore.properties` and fill it in.
   The build is already wired to read it (`android/upload-signing.gradle`). `keystore.properties` and `*.keystore` are git-ignored.

   `keytool -genkeypair -v -keystore C:\Users\YOU\keys\ky-fitness-upload.keystore -alias upload -keyalg RSA -keysize 4096 -validity 10000`
4. Build the bundle: `.\gradlew.bat :app:bundleRelease` from the `android` folder (Play needs an `.aab`, not an `.apk`). The watch app uses the same package, so upload it to the
   same listing under Wear OS, with a **higher `versionCode`** than the phone build.
5. Create the app in Play Console, switch on **Play App Signing**, upload the bundle to **Internal testing** first.
6. **Google Drive backup:** in Google Cloud Console, add an Android OAuth client for `com.kyfitness.app` with the **SHA-1 of Play's app signing key**
   (shown in Play Console > App integrity) and one with the upload key's SHA-1. `drive.appdata` is a non-sensitive scope, so no verification review is needed.
   Without this, sign-in works only in your own debug build.
7. Fill in App content (privacy policy URL, data safety, Health apps, Health Connect, foreground service, ads, rating, audience).
8. Closed test with 12+ testers for 14 days, fix what they find, then apply for production.
9. Watch faces (`com.kyfitness.face`, `com.kyfitness.face.digital`) are separate listings. Leave them for a later release.

## 9. Test on real devices before submitting

- Auto-pause on the phone and the watch (stop moving mid-run and see if it pauses).
- Watch screen sleep and wake-on-gesture during a workout.
- Drive detection removing steps.
- Sleep from two trackers after "Use Health Connect" is on.
- Drive backup after step 6 above, and restore on a second device.
- A first-run pass on a clean phone (grant, deny and later allow each permission).
- Release-build smoke test, especially if you switch on `minifyEnabled`.

## 10. Policy points to keep true

- Health data is never used for ads or sold, and the privacy policy must say what each optional service sees (it does).
- Do not add SMS, call-log or contacts permissions, background location, or any analytics without updating the policy and the data safety form first.
- Keep medical wording to "track" and "log"; never "diagnose", "treat" or "detect a condition".
- "Google-inspired" theme and androids are original designs, not Google artwork; keep the not-affiliated line. Do not use the Android or Google logos.
- Keep `PRIVACY.md`, the in-app privacy screen, and the Data safety form saying the same thing.
