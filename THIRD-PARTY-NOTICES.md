# Third-party components

Minimal Fitness itself is released under the GPL-3.0-or-later (see [LICENSE](LICENSE)). It builds on the open-source and
freely licensed components below. Each keeps its own license; the full texts ship inside each package (`node_modules/<name>/`)
or are published by its authors. This list is a summary, not a replacement for those texts.

## Code bundled into the app

| Component | License |
| --- | --- |
| React, React DOM | MIT |
| Capacitor (core, Android, app, app-launcher, filesystem, geolocation, local-notifications, share) | MIT |
| Leaflet | BSD-2-Clause |
| protomaps-leaflet, pmtiles | BSD-3-Clause |
| three.js | MIT |
| motion | MIT |
| lucide-react (icons) | ISC |
| @zxing/library (barcode scanning) | Apache-2.0 |
| fflate | MIT |
| Figtree, Barlow Condensed (fonts via Fontsource) | SIL Open Font License 1.1 |

Build and test tools (Vite, TypeScript, Tailwind CSS, esbuild, tsx) are not shipped inside the app.

## Android libraries

AndroidX (core, appcompat, activity, biometric, browser, documentfile, work, viewpager2, Health Connect client, Health Services,
Wear OS, Wear Tiles, Wear ProtoLayout, Watch Face complications), Guava and Kotlin coroutines are Apache-2.0.

**Google Play services and ML Kit** (`play-services-location`, `play-services-wearable`, `play-services-auth`, `mlkit` image
labeling and text recognition) are Google's own libraries under Google's terms, not open source. They provide the watch link,
fused location backup, Google sign-in and on-device label/text recognition. This is the one part of the app that is not fully
free software, and it matters for stores such as F-Droid, which flag it. A fork that must be 100% free can replace those
libraries (the location service already checks whether Play services is present; the watch link and sign-in would need replacing).

## Data bundled or read at run time

| Data | License / terms |
| --- | --- |
| free-exercise-db (exercise list) | Unlicense (public domain) |
| USDA FoodData Central (foods) | Public domain (U.S. government work) |
| Open Food Facts (barcode lookups, only when you scan) | Open Database License (ODbL) for the data, DbCL for contents |
| 3D android characters | Original artwork made for this project, GPL-3.0-or-later with the code |
| Esri map tiles (shown only while you look at a map) | Esri's terms of use and attribution; not part of this repository's license |

If you notice a component that is missing or listed wrongly, please open an issue or a pull request.
