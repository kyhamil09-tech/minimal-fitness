# Contributing

Thank you for wanting to improve Minimal Fitness. Forks, bug reports, ideas and pull requests are all welcome.

## License of contributions

The project is GPL-3.0-or-later. By sending a contribution you agree that it is released under the same license. There is no
separate contributor agreement. Keep your own copyright notice on files you create if you want one.

## Ground rules (these are what make the app what it is)

* **Private by default.** No analytics, no ads, no accounts of our own, no third-party trackers. Any request the app makes must
  be listed in `src/lib/netHosts.ts` and pass through `src/lib/netGuard.ts`. A change that sends data off the device needs a
  clear reason, a switch that defaults to off, and an entry in `PRIVACY.md`.
* **Google only for connections.** If a feature needs an account or service, it uses Google's (Health Connect, Google Calendar,
  Google sign-in) and says so on screen. Nothing else is added silently.
* **Works offline.** Features should keep working in airplane mode, and show "—" rather than a made-up number when there is no
  data.
* **No SMS permission, no sample data.**
* **US English** spelling and US date formats in the text people read.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint       # type-check
npm test           # unit tests
```

Android builds need JDK 21 and the Android SDK (see the README for the exact commands). Please run `npm run lint` and
`npm test` before sending a pull request, and add a test for new logic. Put pure logic in `src/lib` or a mini-app's `model.ts`
and keep screens thin, as the existing code does.

## Reporting problems

Open an issue with what you did, what you expected and what happened, plus your phone and Android version. For a security
problem, please describe it privately to the maintainer first instead of in a public issue.

## Never commit

Signing keys (`*.keystore`, `keystore.properties`), `local.properties`, `.env` files and any real health data.
