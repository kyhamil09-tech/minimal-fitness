# How to check a download

You should not have to take anyone's word that an APK is what it claims to be. Each release is built **by GitHub, from the
public source in this repository**, not on a personal computer, and ships with the evidence below. You can check it.

## 1. Read the code

Everything is here under the GPL-3.0. Start with:

* `src/lib/netHosts.ts` and `src/lib/netGuard.ts`: every host the app may contact, and the guard that refuses all others.
* `android/app/src/main/AndroidManifest.xml`: every permission the app asks for.
* `PRIVACY.md`: what is and is not sent, and why.

## 2. See how it was built

Open the release, then the **Actions** run linked from it. The workflow file `.github/workflows/release.yml` is the whole
recipe: install the tools, type-check, run the tests, build, sign, publish. It is in this repository, so you can read exactly
what ran.

## 3. Check the file you downloaded

Each release has `SHA256SUMS.txt`. Compare it with your download:

```bash
sha256sum minimal-fitness.apk
```

(On Windows PowerShell: `Get-FileHash minimal-fitness.apk -Algorithm SHA256`.) The result must match the line in `SHA256SUMS.txt`.

## 4. Check where it came from

GitHub signs a build-provenance attestation for each APK, tying the file to this repository, the exact commit and the workflow
run that made it. With the GitHub CLI:

```bash
gh attestation verify minimal-fitness.apk --repo kyhamil09-tech/minimal-fitness
```

If that passes, the file was produced by this repository's release workflow and has not been changed since.

## 5. Check the app's signature

Every release is signed with the same key, so updates install over the old version. Its fingerprint is:

```
SHA-256: 0E:1E:28:19:28:A9:E6:05:E3:AD:9D:84:74:71:C6:2C:89:57:5A:5B:8B:F7:CD:D3:35:F9:55:31:21:4B:FF:EB
```

Check it with `apksigner verify --print-certs minimal-fitness.apk` (part of the Android SDK build-tools). A different
fingerprint means the APK was not signed by this project.

## 6. Watch it behave

Settings > Privacy & data lists every request the app has made, exactly as sent, and shows Android's own count of bytes the
app has sent. Turn on airplane mode and the app keeps working.

## What this does not prove

* **Google's libraries are closed.** The watch link, GPS backup, Google sign-in (Drive backup) and on-device label scanning use
  Google Play services and ML Kit, which are Google's code, not this project's. They are listed in THIRD-PARTY-NOTICES.md.
* **Nobody can promise bug-free code.** Open source means anyone can look, and anyone who finds a problem can report it in
  public. Security reports are welcome (see CONTRIBUTING.md).
