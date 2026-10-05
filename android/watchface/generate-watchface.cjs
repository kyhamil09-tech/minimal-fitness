// Regenerates the watch face XML and its option strings:
//   node generate-watchface.js
// Colour option ids MUST be numbers ("0", "1", ...): word ids are silently ignored by the watch.
// Design: a Wear OS "adventure"-style face. A big time on the right, nine complications (rings, buttons, curved-style
// text and two edge arcs), a diagonal two-tone background, and colour themes that each carry four gradient colours.
const fs = require('fs');
const path = require('path');
const res = path.join(__dirname, 'src', 'main', 'res');

// ---- colour schemes: one pick changes the whole face, like a palette plus background on the phone ----
// Each option carries seven colours: [0..3] the four gradient accents (bezel ticks, rings, arcs, buttons), [4] the background, [5] the
// main text (time and complications) and [6] the secondary text (date). Backgrounds are always dark: a watch face has to stay dark in
// ambient mode and to save battery.
const CHAR = '#ff17181b';
const CREAM = '#fff2ede3';
const DIM = '#ffd6d1c6';
const scheme = (name, four, bg = CHAR, ink = CREAM, dim = DIM) => [name, `${four} ${bg} ${ink} ${dim}`];
// The earlier colour themes keep their places (a saved choice keeps its meaning) and now sit on soft charcoal with cream text.
const themes = [
  scheme('Volt Run', '#ffcbff00 #ffff5a1f #ff00d4ff #ffffd23f'),
  scheme('Fire', '#ffff3b1f #ffffa000 #ffffd23f #ffff6a00'),
  scheme('Steel Blue', '#ff2f8cff #ff00e5ff #ff9ad1ff #ff5eead4'),
  scheme('Toxic', '#ff39ff14 #ffcbff00 #ff00e5ff #ffffe600'),
  scheme('Stealth', '#ffe8e4da #ff8a8f98 #ffcbff00 #ffff3b30'),
  scheme('Gold Rush', '#ffffc400 #ffff8f00 #fffff0a0 #ffff5a1f'),
  scheme('Ice', '#ff00e5ff #ff2f8cff #ffe0f7ff #ff5eead4'),
  scheme('Red Alert', '#ffff1744 #ffff6a00 #fff2ede3 #ffcbff00'),
];
// Then every palette of the phone app with its background, read from looks.json (made by export-looks.ts from src/data/themes.ts), so
// the face offers the same schemes as the phone. The soft palettes also come on AMOLED black.
try {
  const { looks } = JSON.parse(fs.readFileSync(path.join(__dirname, 'looks.json'), 'utf8'));
  const soft = ['grounded', 'high_energy', 'mind_body', 'ocean_calm'];
  const clean = (n) => n.replace(/&/g, 'and').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 26);
  const have = new Set(themes.map((t) => t[0].toLowerCase()));
  const add = (name, l, bg) => {
    if (have.has(name.toLowerCase())) return;
    have.add(name.toLowerCase());
    themes.push(scheme(name, l.colors.join(' '), bg ?? l.bg, l.ink, l.dim));
  };
  for (const id of soft) {
    const l = looks.find((x) => x.id === id);
    if (l) add(clean(l.name), l);
  }
  for (const id of soft) {
    const l = looks.find((x) => x.id === id);
    if (l) add(clean(l.name) + ' AMOLED', l, '#ff000000');
  }
  for (const l of looks) if (l.id !== 'volt' && !soft.includes(l.id)) add(clean(l.name), l);
} catch (e) {
  console.warn('looks.json not found: only the built-in schemes are offered (run npm run watchface)');
}

const cfg = (id, list, prefix) =>
  `    <ColorConfiguration id="${id}" displayName="@string/cfg_${id}" defaultValue="0">\n` +
  list.map((o, i) => `      <ColorOption id="${i}" displayName="@string/${prefix}_${i}" colors="${o[1]}"/>`).join('\n') +
  `\n    </ColorConfiguration>`;

const T = (i) => `[CONFIGURATION.theme.${i}]`;
const BG = '[CONFIGURATION.theme.4]';
const TIME = '[CONFIGURATION.theme.5]';
const LABEL = '[CONFIGURATION.theme.6]';
const COMP = '[CONFIGURATION.theme.5]';
const AMB = '<Variant mode="AMBIENT" target="alpha" value="0"/>';

// ---- complication slots ----
// ring: ranged value drawn as a 270 degree gauge with the number inside
// button: a circle holding an icon or short text
// text: small text along the edge, tilted to follow the curve
// arc: a gauge along the right edge with its label
const slots = [
  { id: 0, kind: 'ring', x: 70, y: 52, d: 112, color: 0, provider: 'WATCH_BATTERY', type: 'RANGED_VALUE', name: 'Top ring' },
  { id: 1, kind: 'button', x: 270, y: 64, d: 72, color: 1, provider: 'APP_SHORTCUT', type: 'SMALL_IMAGE', name: 'Top button' },
  { id: 2, kind: 'ring', x: 16, y: 169, d: 112, color: 2, provider: 'STEP_COUNT', type: 'RANGED_VALUE', name: 'Left ring' },
  { id: 3, kind: 'ring', x: 70, y: 286, d: 112, color: 3, provider: 'SUNRISE_SUNSET', type: 'SHORT_TEXT', name: 'Bottom ring' },
  { id: 4, kind: 'button', x: 271, y: 310, d: 68, color: 2, provider: 'DAY_OF_WEEK', type: 'SHORT_TEXT', name: 'Bottom button' },
  { id: 5, kind: 'text', x: 150, y: 22, w: 170, h: 32, angle: 0, provider: 'NEXT_EVENT', type: 'LONG_TEXT', name: 'Top-left text' },
  { id: 6, kind: 'text', x: 160, y: 378, w: 160, h: 30, angle: 0, provider: 'UNREAD_NOTIFICATION_COUNT', type: 'SHORT_TEXT', name: 'Bottom-left text' },
  { id: 7, kind: 'arc', start: 8, end: 80, labelX: 296, labelY: 14, color: 3, provider: 'WATCH_BATTERY', type: 'RANGED_VALUE', name: 'Right arc top' },
  { id: 8, kind: 'arc', start: 100, end: 172, labelX: 372, labelY: 362, color: 1, provider: 'STEP_COUNT', type: 'RANGED_VALUE', name: 'Right arc bottom' },
];

const fraction = '([COMPLICATION.RANGED_VALUE_VALUE] - [COMPLICATION.RANGED_VALUE_MIN]) / ([COMPLICATION.RANGED_VALUE_MAX] - [COMPLICATION.RANGED_VALUE_MIN])';
const font = (family, size, color) => `<Font family="${family}" size="${size}" weight="BOLD" slant="ITALIC" color="${color}"`;

const ringSlot = (s) => {
  const c = s.d / 2;
  const th = 10;
  const aw = s.d - 2 * (th / 2 + 3);
  const glow = `<PartDraw x="0" y="0" width="${s.d}" height="${s.d}">\n          ${AMB}\n          <Ellipse x="0" y="0" width="${s.d}" height="${s.d}"><Fill color="#ff111111"/></Ellipse>\n          <Ellipse x="0" y="0" width="${s.d}" height="${s.d}"><Stroke color="#22ffffff" thickness="2"/></Ellipse>\n        </PartDraw>\n        <PartDraw x="0" y="0" width="${s.d}" height="${s.d}" tintColor="${T(s.color)}">\n          ${AMB}\n          <Ellipse x="1" y="1" width="${s.d - 2}" height="${s.d - 2}"><Stroke color="#aaffffff" thickness="2" dashIntervals="1.5 5.5" dashPhase="0"/></Ellipse>\n        </PartDraw>`;
  const gauge = (frac) => `<PartDraw x="0" y="0" width="${s.d}" height="${s.d}" pivotX="0.5" pivotY="0.5" angle="225">
          ${AMB}
          <Arc centerX="${c}" centerY="${c}" width="${aw}" height="${aw}" startAngle="0" endAngle="270" direction="CLOCKWISE"><Stroke color="#1fffffff" thickness="${th}" cap="ROUND"/></Arc>
          ${frac ? `<Arc centerX="${c}" centerY="${c}" width="${aw}" height="${aw}" startAngle="0" endAngle="270" direction="CLOCKWISE"><Transform target="endAngle" value="270 * ${frac}"/><Stroke color="${T(s.color)}" thickness="${th}" cap="ROUND"/></Arc>` : `<Arc centerX="${c}" centerY="${c}" width="${aw}" height="${aw}" startAngle="0" endAngle="270" direction="CLOCKWISE"><Stroke color="${T(s.color)}" thickness="${th}" cap="ROUND"/></Arc>`}
        </PartDraw>`;
  const sizeR = Math.round(s.d * 0.34);
  const sizeT = Math.round(s.d * 0.26);
  return `    <ComplicationSlot slotId="${s.id}" supportedTypes="RANGED_VALUE SHORT_TEXT EMPTY" x="${s.x}" y="${s.y}" width="${s.d}" height="${s.d}" displayName="@string/slot_${s.id}" isCustomizable="true">
      <DefaultProviderPolicy defaultSystemProvider="${s.provider}" defaultSystemProviderType="${s.type}"/>
      <BoundingOval x="0" y="0" width="${s.d}" height="${s.d}"/>
      <Complication type="RANGED_VALUE">
        ${glow}
        ${gauge(fraction)}
        <PartText x="0" y="${Math.round(s.d * 0.25)}" width="${s.d}" height="${Math.round(s.d * 0.5)}">
          ${AMB}
          <Text align="CENTER">${font('barlow_800i', sizeR, COMP)}><Template><![CDATA[%s]]><Parameter expression="[COMPLICATION.TEXT]"/></Template></Font></Text>
        </PartText>
      </Complication>
      <Complication type="SHORT_TEXT">
        ${glow}
        ${gauge(null)}
        <PartText x="0" y="${Math.round(s.d * 0.25)}" width="${s.d}" height="${Math.round(s.d * 0.5)}">
          ${AMB}
          <Text align="CENTER">${font('barlow_800i', sizeT, COMP)}><Template><![CDATA[%s]]><Parameter expression="[COMPLICATION.TEXT]"/></Template></Font></Text>
        </PartText>
      </Complication>
    </ComplicationSlot>`;
};

const buttonSlot = (s) => {
  const c = s.d / 2;
  const disc = `<PartDraw x="0" y="0" width="${s.d}" height="${s.d}">
          ${AMB}
          <Ellipse x="1" y="1" width="${s.d - 2}" height="${s.d - 2}"><Fill color="#ff111111"/></Ellipse>
          <Ellipse x="1" y="1" width="${s.d - 2}" height="${s.d - 2}"><Stroke color="${T(s.color)}" thickness="4"/></Ellipse>
          <Ellipse x="8" y="8" width="${s.d - 16}" height="${s.d - 16}"><Stroke color="#44ffffff" thickness="1.5" dashIntervals="1.5 4.5" dashPhase="0"/></Ellipse>
        </PartDraw>`;
  const pad = Math.round(s.d * 0.24);
  return `    <ComplicationSlot slotId="${s.id}" supportedTypes="SHORT_TEXT MONOCHROMATIC_IMAGE SMALL_IMAGE EMPTY" x="${s.x}" y="${s.y}" width="${s.d}" height="${s.d}" displayName="@string/slot_${s.id}" isCustomizable="true">
      <DefaultProviderPolicy defaultSystemProvider="${s.provider}" defaultSystemProviderType="${s.type}"/>
      <BoundingOval x="0" y="0" width="${s.d}" height="${s.d}"/>
      <Complication type="SHORT_TEXT">
        ${disc}
        <PartText x="0" y="${Math.round(s.d * 0.26)}" width="${s.d}" height="${Math.round(s.d * 0.48)}">
          ${AMB}
          <Text align="CENTER">${font('barlow_800i', Math.round(s.d * 0.34), COMP)}><Template><![CDATA[%s]]><Parameter expression="[COMPLICATION.TEXT]"/></Template></Font></Text>
        </PartText>
      </Complication>
      <Complication type="MONOCHROMATIC_IMAGE">
        ${disc}
        <PartImage x="${pad}" y="${pad}" width="${s.d - 2 * pad}" height="${s.d - 2 * pad}">
          ${AMB}
          <Image resource="[COMPLICATION.MONOCHROMATIC_IMAGE]" tintColor="${COMP}"/>
        </PartImage>
      </Complication>
      <Complication type="SMALL_IMAGE">
        ${disc}
        <PartImage x="${pad}" y="${pad}" width="${s.d - 2 * pad}" height="${s.d - 2 * pad}">
          ${AMB}
          <Image resource="[COMPLICATION.SMALL_IMAGE]"/>
        </PartImage>
      </Complication>
    </ComplicationSlot>`;
};

const textSlot = (s) => `    <ComplicationSlot slotId="${s.id}" supportedTypes="SHORT_TEXT LONG_TEXT EMPTY" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" displayName="@string/slot_${s.id}" isCustomizable="true">
      <DefaultProviderPolicy defaultSystemProvider="${s.provider}" defaultSystemProviderType="${s.type}"/>
      <BoundingBox x="0" y="0" width="${s.w}" height="${s.h}"/>
      <Complication type="LONG_TEXT">
        <PartText x="0" y="0" width="${s.w}" height="${s.h}" pivotX="0.5" pivotY="0.5" angle="${s.angle}">
          ${AMB}
          <Text align="CENTER">${font('barlow_700i', 23, COMP)}><Template><![CDATA[%s]]><Parameter expression="[COMPLICATION.TEXT]"/></Template></Font></Text>
        </PartText>
      </Complication>
      <Complication type="SHORT_TEXT">
        <PartText x="0" y="0" width="${s.w}" height="${s.h}" pivotX="0.5" pivotY="0.5" angle="${s.angle}">
          ${AMB}
          <Text align="CENTER">${font('barlow_700i', 23, COMP)}><Template><![CDATA[%s]]><Parameter expression="[COMPLICATION.TEXT]"/></Template></Font></Text>
        </PartText>
      </Complication>
    </ComplicationSlot>`;

const arcSlot = (s) => {
  const R = 206;
  const arc = (frac) => `<Arc centerX="225" centerY="225" width="${R * 2}" height="${R * 2}" startAngle="${s.start}" endAngle="${s.end}" direction="CLOCKWISE">${frac ? `<Transform target="endAngle" value="${s.start} + ${s.end - s.start} * ${frac}"/>` : ''}<Stroke color="${frac || true ? (frac ? T(s.color) : T(s.color)) : '#26ffffff'}" thickness="9" cap="ROUND"/></Arc>`;
  const track = `<Arc centerX="225" centerY="225" width="${R * 2}" height="${R * 2}" startAngle="${s.start}" endAngle="${s.end}" direction="CLOCKWISE"><Stroke color="#1fffffff" thickness="9" cap="ROUND"/></Arc>`;
  const label = `<PartText x="${s.labelX}" y="${s.labelY}" width="80" height="34">
          ${AMB}
          <Text align="CENTER">${font('barlow_800i', 28, COMP)}><Template><![CDATA[%s]]><Parameter expression="[COMPLICATION.TEXT]"/></Template></Font></Text>
        </PartText>`;
  return `    <ComplicationSlot slotId="${s.id}" supportedTypes="RANGED_VALUE SHORT_TEXT EMPTY" x="0" y="0" width="450" height="450" displayName="@string/slot_${s.id}" isCustomizable="true">
      <DefaultProviderPolicy defaultSystemProvider="${s.provider}" defaultSystemProviderType="${s.type}"/>
      <BoundingArc centerX="225" centerY="225" width="${R * 2}" height="${R * 2}" startAngle="${s.start}" endAngle="${s.end}" direction="CLOCKWISE" strokeThickness="30"/>
      <Complication type="RANGED_VALUE">
        ${label}
      </Complication>
      <Complication type="SHORT_TEXT">
        ${label}
      </Complication>
    </ComplicationSlot>`;
};

const sceneArc = (s, expr) => `    <PartDraw x="0" y="0" width="450" height="450">
      ${AMB}
      <Arc centerX="225" centerY="225" width="412" height="412" startAngle="${s.start}" endAngle="${s.end}" direction="CLOCKWISE"><Stroke color="#1fffffff" thickness="9" cap="ROUND"/></Arc>
      <Arc centerX="225" centerY="225" width="412" height="412" startAngle="${s.start}" endAngle="${s.end}" direction="CLOCKWISE"><Transform target="endAngle" value="${s.start} + ${s.end - s.start} * (0.02 + ${expr})"/><Stroke color="${T(s.color)}" thickness="9" cap="ROUND"/></Arc>
    </PartDraw>`;
const sceneArcs = sceneArc(slots[7], '0.98 * [BATTERY_PERCENT] / 100') + '\n' + sceneArc(slots[8], '1.4 * [STEP_COUNT] / ([STEP_COUNT] + 10000)');
const slotXml = slots.map((s) => (s.kind === 'ring' ? ringSlot(s) : s.kind === 'button' ? buttonSlot(s) : s.kind === 'text' ? textSlot(s) : arcSlot(s))).join('\n\n');

const xml = `<?xml version="1.0"?>
<!--
    Minimal Fitness watch face (generated by generate-watchface.js).
    Nine complications: three gauge rings, two round buttons, two edge texts and two edge arcs.
    Long-press the face > Edit to change the complications, the colour theme (four gradient colours each),
    and the time, label and complication colours.
-->
<WatchFace width="450" height="450">
  <Metadata key="CLOCK_TYPE" value="DIGITAL"/>
  <Metadata key="PREVIEW_TIME" value="10:59:32"/>

  <UserConfigurations>
${cfg('theme', themes, 'theme')}
  </UserConfigurations>
  <Scene backgroundColor="#ff000000">

    <!-- Base: dark grey below a diagonal, a colour-washed gradient above it -->
    <PartDraw x="0" y="0" width="450" height="450">
      ${AMB}
      <Rectangle x="0" y="0" width="450" height="450"><Fill color="${BG}"/></Rectangle>
    </PartDraw>
    <!-- Bezel ticks: a mark every minute, a theme-coloured mark every five -->
    <PartDraw x="0" y="0" width="450" height="450">
      ${AMB}
      <Arc centerX="225" centerY="225" width="436" height="436" startAngle="-0.6" endAngle="359.4" direction="CLOCKWISE"><Stroke color="#44ffffff" thickness="8" cap="BUTT" dashIntervals="2.3 20.7" dashPhase="0"/></Arc>
    </PartDraw>
    <PartDraw x="0" y="0" width="450" height="450" tintColor="${T(0)}">
      ${AMB}
      <Arc centerX="225" centerY="225" width="436" height="436" startAngle="-1" endAngle="359" direction="CLOCKWISE"><Stroke color="#ffffffff" thickness="12" cap="BUTT" dashIntervals="4.6 108.9" dashPhase="0"/></Arc>
    </PartDraw>

    <!-- Accent bar above the time, fading out to the right -->
    <PartDraw x="0" y="0" width="450" height="450" tintColor="${T(0)}">
      ${AMB}
      <Rectangle x="214" y="152" width="214" height="5"><Fill><LinearGradient startX="214" startY="0" endX="428" endY="0" colors="#ffffffff #00ffffff" positions="0 1"/></Fill></Rectangle>
    </PartDraw>
    <PartDraw x="0" y="0" width="450" height="450" tintColor="${T(1)}">
      ${AMB}
      <Rectangle x="214" y="302" width="150" height="3"><Fill><LinearGradient startX="214" startY="0" endX="364" endY="0" colors="#ffffffff #00ffffff" positions="0 1"/></Fill></Rectangle>
    </PartDraw>
    <!-- Date, under the time -->
    <PartText x="206" y="250" width="230" height="36">
      ${AMB}
      <Text align="CENTER">${font('barlow_700i', 31, LABEL)}><Template>%s, %s %s<Parameter expression="[DAY_OF_WEEK_S]"/><Parameter expression="[MONTH_S]"/><Parameter expression="[DAY]"/></Template></Font></Text>
    </PartText>

    <!-- Time -->
    <DigitalClock x="0" y="0" width="450" height="450">
      <TimeText format="hh:mm" hourFormat="SYNC_TO_DEVICE" align="CENTER" x="186" y="158" width="240" height="100" alpha="255">
        <Variant mode="AMBIENT" target="alpha" value="0"/>
        <Font family="barlow_800i" size="108" weight="ULTRA_BOLD" slant="ITALIC" color="${TIME}"/>
      </TimeText>
      <TimeText format="hh:mm" hourFormat="SYNC_TO_DEVICE" align="CENTER" x="0" y="150" width="450" height="130" alpha="0">
        <Variant mode="AMBIENT" target="alpha" value="255"/>
        <Font family="barlow_500" size="150" weight="NORMAL" slant="NORMAL" color="#ffd0d0d0"/>
      </TimeText>
    </DigitalClock>

${sceneArcs}\n\n${slotXml}
  </Scene>
</WatchFace>
`;
fs.writeFileSync(path.join(res, 'raw', 'watchface.xml'), xml);

// ---- strings ----
const names = (list, prefix) => list.map((o, i) => `    <string name="${prefix}_${i}">${o[0]}</string>`).join('\n');
const strings = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="watch_face_name">Minimal Fitness</string>
    <string name="cfg_theme">Color scheme</string>
${slots.map((s) => `    <string name="slot_${s.id}">${s.name}</string>`).join('\n')}
${names(themes, 'theme')}
</resources>
`;
fs.writeFileSync(path.join(res, 'values', 'strings.xml'), strings);
console.log('generated', xml.length, 'bytes');












