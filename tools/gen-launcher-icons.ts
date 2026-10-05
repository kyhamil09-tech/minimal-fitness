// Writes the Android launcher icons for every logo colour preset, the watch app icon and the web app icon, from src/lib/appLogo.ts.
// Run from the project root:  npx tsx tools/gen-launcher-icons.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LOGO_PRESETS, MARK_PATH, MARK_WIDTH, RING, androidForeground, logoSvg } from '../src/lib/appLogo';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const res = join(root, 'android', 'app', 'src', 'main', 'res');
mkdirSync(join(res, 'drawable'), { recursive: true });
mkdirSync(join(res, 'mipmap-anydpi-v26'), { recursive: true });

const adaptive = (id: string) => `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/logo_bg_${id}"/>
    <foreground android:drawable="@drawable/ic_logo_fg_${id}"/>
</adaptive-icon>
`;

let colors = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n`;
let aliases = '';
LOGO_PRESETS.forEach((p, i) => {
  writeFileSync(join(res, 'drawable', `ic_logo_fg_${p.id}.xml`), androidForeground('ring', { bg: p.bg, ink: p.ink }));
  writeFileSync(join(res, 'mipmap-anydpi-v26', `ic_launcher_${p.id}.xml`), adaptive(p.id));
  colors += `    <color name="logo_bg_${p.id}">${p.bg}</color>\n`;
  aliases += `        <activity-alias
            android:name=".Icon${p.id[0].toUpperCase()}${p.id.slice(1)}"
            android:enabled="${i === 0 ? 'true' : 'false'}"
            android:exported="true"
            android:icon="@mipmap/ic_launcher_${p.id}"
            android:roundIcon="@mipmap/ic_launcher_${p.id}"
            android:label="@string/app_name"
            android:targetActivity=".MainActivity">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity-alias>
`;
});
colors += `</resources>\n`;
writeFileSync(join(res, 'values', 'logo_colors.xml'), colors);

// The default icon (also used inside the system's app list and notifications) is the first preset.
const first = LOGO_PRESETS[0];
writeFileSync(join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptive(first.id));
writeFileSync(join(res, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptive(first.id));

// Manifest: the aliases go between the markers.
const manifestPath = join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
manifest = manifest.replace(/(<!-- ICON-ALIASES:START[^>]*-->\n)[\s\S]*?(\s*<!-- ICON-ALIASES:END -->)/, `$1${aliases}$2`);
writeFileSync(manifestPath, manifest);

// Watch app icon: the same logo on the first preset's background, a little larger because the watch crops to a circle.
const scale = 0.1;
const tx = (54 - RING.cx * scale).toFixed(3);
const ty = (54 - RING.cy * scale).toFixed(3);
const circle = (r: number) => `M${RING.cx - r},${RING.cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`;
const watch = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="96dp"
    android:height="96dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="${first.bg}" android:pathData="M0,0h108v108h-108z" />
    <group android:scaleX="${scale}" android:scaleY="${scale}" android:translateX="${tx}" android:translateY="${ty}">
        <path android:pathData="${circle(RING.r)}" android:strokeColor="${first.ink}" android:strokeWidth="${RING.width}" android:fillColor="#00000000"/>
        <path android:pathData="${MARK_PATH}" android:strokeColor="${first.ink}" android:strokeWidth="${MARK_WIDTH}" android:strokeLineJoin="round" android:strokeLineCap="round" android:fillColor="#00000000"/>
    </group>
</vector>
`;
writeFileSync(join(root, 'android', 'wear', 'src', 'main', 'res', 'drawable', 'ic_launcher.xml'), watch);

// Web app icon
writeFileSync(join(root, 'public', 'icon.svg'), logoSvg('ring', { bg: first.bg, ink: first.ink }, 512));
console.log(`wrote ${LOGO_PRESETS.length} launcher icons, the watch icon and public/icon.svg`);
