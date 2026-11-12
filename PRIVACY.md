# Privacy: what Minimal Fitness does with your data

**Short version: your data stays on your phone. There is no account, no server, and nothing is ever sent to the developer.**
The app has no sign-in of its own. The only account it can ever use is your **Google** account, and only if you turn on the
optional Google Drive backup. Everything else that leaves the phone is a plain request to one of the services listed below, and
each is off or user-started.
This page says exactly what the app does, and every claim can be checked on your own phone (see the end).

*Last updated: 2026-10-14. Developer contact: [CONTACT EMAIL].*

## What the app stores, and where

Everything you log or record (workouts, GPS routes, heart rate, sleep, food, water, weight, breathing sessions, challenges, settings) is saved in the app's
private storage on your phone. Other apps cannot read it. Uninstalling the app, or **Settings > Erase all my data**, removes it.
Backups only go where *you* point them: a folder you choose, or (optionally) your own Google Drive as described below. Android's
automatic Google cloud backup is **turned off** for this app.

## What the app can send over the internet

Only the services in this table, plus the one recipe page you ask for (below), and nothing else. The list lives in one file, `src/lib/netHosts.ts`, and the app, the
build, and the native code all follow it.

| Feature | Host | What is sent |
| --- | --- | --- |
| Maps (dark, street, terrain, satellite) | `server.arcgisonline.com` | The tile numbers (zoom, x, y) for the map area on screen, so the map server can tell roughly where you are looking. Never your route. Tiles you have seen are cached on the phone. |
| Running weather (off until you turn it on) | `api.open-meteo.com` | Your location rounded to about 1 km. |
| Food and barcode search | `world.openfoodfacts.org` | The barcode or the words you typed. |
| USDA branded-food lookup (off until you tap it) | `api.nal.usda.gov` | The barcode digits, only when you tap to search the USDA list after Open Food Facts had no answer, and your own free USDA key if you added one. |
| Recipe import (only when you tap Import) | the one page whose address you typed or pasted | A plain request for that page: no cookies, no sign-in, nothing about you. Made by native code, https only, public addresses only (never your own network). The page is read on the phone and not kept. |
| Strava (does nothing until you connect it) | `www.strava.com` | The workouts you upload, with the Client ID and Secret you entered. |
| Google Drive backup (off until you turn it on) | `www.googleapis.com` | One encrypted backup file in the app's own hidden Drive folder, and your Google sign-in. See below. |

Not in the app: analytics, advertising, crash-reporting or tracking services, social logins, or any server run by the
developer. Fonts and all code are packaged inside the app.

## Google Drive backup (optional, Google only)

Off by default. If you turn it on you sign in with your Google account through Google's own sign-in. The app asks for one narrow
permission, **Drive app data** (`drive.appdata`): a hidden folder that only this app can see. It cannot see your other Drive
files or anything else in your account. The backup is **encrypted on your phone with a passphrase only you know** before it
leaves, so Google stores a file it cannot read. It runs about once a day and after a new workout, while the app is open. If you
forget the passphrase the backups cannot be opened by anyone. You can turn it off, and sign out, at any time, and remove the
backup file from your Google account's app data settings. This is the only sign-in in the app, and it is Google only.

## Health Connect

- **Receiving (the default once Health Connect is on).** The app reads from Health Connect only the data types you allow, one
  group at a time, such as sleep, heart rate, steps, workouts and weight from your watch or other trackers. It stays on the phone.
- **Sending (off by default).** A separate switch lets the app save things you log into Health Connect. Even then, nothing is
  sent unless you tick that kind of data in a checklist, and unticking stops it at once. Other apps you allow in Health Connect
  can read whatever is sent, and some of them upload to their own cloud, which this app does not control. Android's Health
  Connect screen shows which apps can read it.
- The app never sends Health Connect data to the developer or to any advertiser, and never uses it for ads.

## Friends and challenges (optional, no accounts)

Off by default. If you turn it on you can start a challenge (steps, distance, workouts, active minutes or weight lifted over a few days) and join friends'. There
are no accounts and no servers: a challenge is a short text code, and an update is a short text code, and you send them to friends yourself
through any app you choose from Android's share sheet. An update holds only the display name you typed, the challenge it belongs to, and your
totals for that one measure, day by day. It never holds your location, heart rate, sleep or any other health detail. Totals are not verified. You
can leave and delete a challenge at any time, and what friends sent you is stored only on your phone. A challenge can also be shown as a QR code drawn on your phone for a friend to scan with their camera; the picture is read on their phone and never saved or sent.

## Food label scanning, recipes and exercise videos

- **Scan label.** A photo of a nutrition label is read **on the phone** by a text-recognition model packaged inside the app (Google ML Kit's bundled model, which does not download anything or contact Google). The picture is not saved or sent.
- **Recipe import.** Add food > Recipe > "From a web address". Only when you tap Get the recipe, the app downloads that one page, finds the recipe's ingredients and servings in it, and shows them for you to check. It is listed in Settings > Privacy & data and in the request log, and Offline mode blocks it. Pasting an ingredient list sends nothing.
- **Find a video.** On an exercise, "Find a video" opens a YouTube search for the exercise name (or a link you saved) in an overlay on top of the app, using Android's browser. That is YouTube's page, under YouTube's own privacy policy, so it can set its own cookies and see that the page was opened. Only the exercise name is in the address, and only when you tap it. The saved link stays on your phone.

## Coach notes and the calorie guide

Both work entirely on the phone. **Coach notes** (off by default) schedule a short encouraging message each day and a weekly review notification with Android's own notification scheduler. The messages are fixed text kept in the app, chosen on the phone; nothing is fetched or sent. The **Calorie guide** works out BMI, the healthy weight range and a daily calorie target from the age, height, weight, sex and activity level already in your profile. After about two weeks of logged weight and food it can also measure your own maintenance calories from a smoothed weight trend and what you ate, and the Lift **Muscle recovery** card estimates how fresh each muscle group is from your recent sets. All of this is arithmetic on data already on the phone; nothing is sent. It is general guidance, not medical advice.

## Sharing your location (optional, manual)

During a GPS workout, **Share my location** opens Android's share sheet with a map link to where you are right now. Nothing
is sent unless you press it and pick an app and a person. The app asks for no SMS permission and sends no texts itself.

## Things that leave the phone only when you press a button

Sharing a workout (goes to the app you pick in Android's share sheet), exporting a GPX or backup file (saved where you
choose), uploading to Strava (if connected), opening a route in Google Maps, and the location link from Share my location.

## Software on your phone that the app relies on but does not control

- **Google Play services** provides the phone's sleep detection and the connection to your watch.
- **Health Connect** holds the health data you allow this app to read and write, on the phone.
- The **Google Health / Fitbit app** is a separate app with its own privacy policy. It is what uploads your watch data to
  Google. Minimal Fitness only reads what that app puts into Health Connect. The only thing it ever sends to Google is the
  optional encrypted Drive backup above.

## How it is enforced, not just promised

1. **Request guard.** Every request the app makes goes through `src/lib/netGuard.ts`, which refuses any host not in the table above (the one exception is the recipe page you type in, which is checked and logged separately), honours the privacy switches, and writes a log.
2. **Security policy in the packaged app.** The build adds a Content Security Policy to `index.html` that lets the web view contact only the web-view hosts above. Android's web engine enforces it, so even a coding mistake could not reach another host.
3. **Native client limits.** `NativeHttpPlugin.java` (used for Strava) accepts `https://www.strava.com` and nothing else. `RecipeFetchPlugin.java` downloads only the single page you asked for, over https, and refuses private, local and home-network addresses, so it cannot be used to reach anything on your own network.
4. **No plain HTTP.** `usesCleartextTraffic` is off.
5. **No cloud backup.** `allowBackup` is off.
6. **Offline mode.** One switch blocks every request the app makes. Everything except live map tiles keeps working.

## Check it yourself

- **Settings > Privacy & data** shows every request the app has made, exactly as sent, a count of requests blocked, the security policy in force, the permissions the app holds, and **Android's own count of bytes this app has sent** (which the app cannot change).
- Turn on **Offline mode** (or airplane mode) and use the app all day. Workouts, sleep, charts and the watch all work.
- In Android **Settings > Apps > Minimal Fitness > Mobile data and Wi-Fi**, Android keeps its own record of the app's data use.
- The code is open source (GPL-3.0) so anyone can read it, build it and check these claims (see the license in the project): start with `src/lib/netHosts.ts`, `src/lib/netGuard.ts` and `android/app/src/main/AndroidManifest.xml`.

## What the permissions are for

| Permission | Why |
| --- | --- |
| Precise and approximate location | GPS workouts and the optional run weather. The route stays on the phone. |
| Foreground service (location) | Keeps recording the route while the screen is off, with a notification showing. |
| Physical activity | The step counter, sleep detection, and noticing when you start a run, ride or walk, all on the phone. |
| Bluetooth | Heart-rate straps, cycling sensors and the watch. |
| Camera | Scanning food barcodes, reading nutrition labels and scanning challenge QR codes, all on the phone, and the guided camera for progress photos, which are kept only on the phone. Scans are never saved or sent. |
| Microphone | Voice food logging with Android's on-device recogniser. Nothing is recorded or saved. |
| Notifications | Reminders, the workout notification, the fasting timer and the optional coach notes. |
| Alarms and boot | Reminders and the fasting timer, restored after a restart. |
| Health Connect | Only the data types you allow, per group. See above. |
| Internet | Only the services listed above. |

## Children, deleting your data, and changes

The app is not made for children under 13. To delete everything, use **Settings > Erase all my data**, or uninstall the app. A
Drive backup, if you made one, is removed from your Google account's app data. If this policy changes, the date at the top changes
and the table of services above is updated first.
