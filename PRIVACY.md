# Privacy: what Minimal Fitness does with your data

**Short version: your data stays on your phone. There is no account, no server, and nothing is ever sent to the developer.**
The one other way anything leaves the phone is the optional **Live share** safety feature (off until you turn it on), which texts
a map link to people you choose. See "Live share" below.
This page says exactly what the app does, and every claim can be checked on your own phone (see the end).

## What the app stores, and where

Everything you log or record (workouts, GPS routes, heart rate, sleep, food, water, weight, settings) is saved in the app's
private storage on your phone. Other apps cannot read it. Uninstalling the app, or **Settings > Erase all my data**, removes it.
Backups only go where *you* point them (a folder you choose); Android's automatic Google cloud backup is **turned off**
for this app.

## What the app can send over the internet

Only the services in this table, and nothing else. The list lives in one file, `src/lib/netHosts.ts`, and the app, the
build, and the native code all follow it.

| Feature | Host | What is sent |
| --- | --- | --- |
| Street and satellite maps | `tile.openstreetmap.org`, `server.arcgisonline.com` | The tile numbers (zoom, x, y) for the map area on screen, so the map server can tell roughly where you are looking. Never your route. Tiles you have seen are cached on the phone. |
| Running weather (off until you turn it on) | `api.open-meteo.com` | Your location rounded to about 1 km. |
| Food and barcode search | `world.openfoodfacts.org` | The barcode or the words you typed. |
| Strava (does nothing until you connect it) | `www.strava.com` | The workouts you upload, with the Client ID and Secret you entered. |

Not in the app: analytics, advertising, crash-reporting or tracking services, social logins, or any server run by the
developer. Fonts and all code are packaged inside the app.

## Live share (text messages, optional)

**Settings > Safety live share** lets you pick up to three people who get a text while you run, walk, hike or ride, so someone
knows where you are. It is **off by default**, and nothing is texted until you add a contact, switch it on and allow Android's
SMS permission (`SEND_SMS`, asked for only at that moment).

- **What is sent:** your name, the activity, time and distance so far, your battery level, and a Google Maps address of your
  position. A text goes out when you start, every 5 to 30 minutes (your choice), once if you stay in the same place for 5
  minutes, when you finish, and immediately when you press the SOS button on a live run.
- **How:** an ordinary SMS from the phone, through your phone company. It does **not** use the internet, passes through no
  server of this app, and Offline mode does not affect it. The map address is a plain link: only the person who opens it
  contacts a map service, and this app never does.
- **Who sees it:** the people you chose, and your phone company, as with any text. The texts also appear in your phone's own
  messages app. Texts may cost money on some plans.
- **Your control:** switch it off for a single run on the Start screen, or entirely in settings. Every text the app has sent
  is listed in Settings > Safety live share. The numbers you add are stored on the phone, and are included in backups you
  make, like your other settings.
- **Limits:** it needs a mobile signal, it only runs for GPS workouts, and it keeps going with the screen off but stops if
  Android closes the app. Do not rely on it as your only safety measure.

## Things that leave the phone only when you press a button

Sharing a workout (goes to the app you pick in Android's share sheet), exporting a GPX or backup file (saved where you
choose), uploading to Strava (if connected), opening a route in Google Maps, and the Live share texts described above
(including the SOS button).

## Software on your phone that the app relies on but does not control

- **Google Play services** provides the phone's sleep detection and the connection to your watch.
- **Health Connect** holds the health data you allow this app to read and write, on the phone.
- The **Google Health / Fitbit app** is a separate app with its own privacy policy. It is what uploads your watch data to
  Google. Minimal Fitness only reads what that app puts into Health Connect, and never sends your data to Google.

## How it is enforced, not just promised

1. **Request guard.** Every request the app makes goes through `src/lib/netGuard.ts`, which refuses any host not in the table above, honours the privacy switches, and writes a log.
2. **Security policy in the packaged app.** The build adds a Content Security Policy to `index.html` that lets the web view contact only the web-view hosts above. Android's web engine enforces it, so even a coding mistake could not reach another host.
3. **Native client limits.** The only native network code (`NativeHttpPlugin.java`, used for Strava) accepts `https://www.strava.com` and nothing else.
4. **No plain HTTP.** `usesCleartextTraffic` is off.
5. **No cloud backup.** `allowBackup` is off.
6. **Offline mode.** One switch blocks every request the app makes. Everything except live map tiles keeps working.

## Check it yourself

- **Settings > Privacy & data** shows every request the app has made, exactly as sent, a count of requests blocked, the security policy in force, the permissions the app holds, and **Android's own count of bytes this app has sent** (which the app cannot change).
- Turn on **Offline mode** (or airplane mode) and use the app all day. Workouts, sleep, charts and the watch all work.
- In Android **Settings > Apps > Minimal Fitness > Mobile data and Wi-Fi**, Android keeps its own record of the app's data use.
- The code is open to read: start with `src/lib/netHosts.ts`, `src/lib/netGuard.ts` and `android/app/src/main/AndroidManifest.xml`.
