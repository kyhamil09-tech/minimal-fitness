// Regenerates the digital watch face XML and its option strings:
//   node generate-watchface.cjs
// Colour/list option ids MUST be numbers ("0", "1", ...): word ids are silently ignored by the watch.
//
// Design (see the preview the user approved): a big Barlow Condensed time with the date above it, eight progress arcs round the rim
// (each is a complication slot whose value and label sit just inside it), a fasting stage bar under the clock, and a seconds dot that
// orbits on a thin rail outside the arcs. Everything is drawn from the complication data and the editor options, so the Pixel Watch
// app and the watch's own editor can change the colours, the background, the seconds dot and every complication.
const fs = require('fs');
const path = require('path');
const res = path.join(__dirname, 'src', 'main', 'res');

// Design coordinates were drawn on a 400 grid; the watch face is 450 wide, so everything is scaled 1.125 about the centre.
const SC = 1.125;
const P = (v) => 225 + (v - 200) * SC;
const n2 = (n) => String(+n.toFixed(2));
// Text parts, the clock and tap areas want whole-number positions.
const ni = (n) => String(Math.round(n));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- colour schemes ----
// The format allows at most five colours per option, so each scheme is five: [0] accent (colon, weekday, seconds dot, fasting bar tint),
// [1] blue, [2] red, [3] purple, [4] secondary. The eight arcs share them (ARC_COLOR below).
// The fasting stage colours are the phone's own and do not change with the scheme; the accent is laid over them at half strength,
// which is the same blend the phone's fasting notification uses.
const STAGE = ['#8AB4F8', '#78D9EC', '#CBFF00', '#FCAD70', '#C58AF9'];
const ARC_COLOR = [0, 1, 2, 3, 0, 4, 1, 4]; // steps, ready, heart, sleep, workout, calories, water, month
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (a) => '#' + a.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const blend = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v * (1 - t) + y[i] * t)); };
const argb = (h) => '#ff' + h.slice(1).toLowerCase();
const scheme = (name, colors) => [name, colors.map(argb).join(' ')];
const clean = (n) => n.replace(/&/g, 'and').replace(/[^A-Za-z0-9 -]/g, '').slice(0, 30);

const themes = [];
try {
  const { looks } = JSON.parse(fs.readFileSync(path.join(__dirname, 'looks.json'), 'utf8'));
  // Kinetic first: it is the default and the app's own accent.
  looks.sort((a, b) => (b.id === 'kinetic') - (a.id === 'kinetic'));
  for (const l of looks) {
    themes.push(scheme('App: ' + clean(l.name), [l.accent, l.blue, l.red, l.purple, l.secondary]));
  }
} catch (e) {
  console.warn('looks.json not found: run npm run watchface:digital (only the own colours are offered)');
}
// The face's own colours: one accent on every arc, plus a mixed set.
const own = [['Lime', '#CBFF00'], ['Mint', '#5EEAD4'], ['Sky', '#7DD3FC'], ['Blue', '#3B82F6'], ['Violet', '#B794FF'], ['Magenta', '#FF4DA6'],
  ['Red', '#FF4D4D'], ['Orange', '#FF8A3D'], ['Amber', '#FFC83D'], ['Gold', '#E5C16B'], ['White', '#F2EDE3'], ['Silver', '#B9B9B4']];
for (const [name, c] of own) themes.push(scheme('Own: ' + name, Array(5).fill(c)));
themes.push(scheme('Own: Rainbow', ['#CBFF00', '#7DD3FC', '#FF4D4D', '#B794FF', '#FF5A1F']));

// ---- backgrounds: ten neutrals; each option is [background, main text, secondary text] ----
const bgs = [['Black', '#000000'], ['Carbon', '#0D0D0D'], ['Graphite', '#1A1B1E'], ['Slate', '#26282C'], ['Iron', '#3A3C41'], ['Stone', '#6B6A66'],
  ['Silver', '#B8B8B4'], ['Bone', '#E9E4D8'], ['Pearl', '#F3F3F1'], ['White', '#FFFFFF']];
const lum = (h) => { const [r, g, b] = rgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const bgOptions = bgs.map(([name, c]) => [name, lum(c) > 0.55 ? `${argb(c)} #ff14130f #ff5f5b52` : `${argb(c)} #fff2ede3 #ffa29e95`]);

const TH = (i) => `[CONFIGURATION.theme.${i}]`;
const BG = '[CONFIGURATION.bg.0]';
const INK = '[CONFIGURATION.bg.1]';
const DIM = '[CONFIGURATION.bg.2]';
const AMB = '<Variant mode="AMBIENT" target="alpha" value="0"/>';
const AMB_ONLY = '<Variant mode="AMBIENT" target="alpha" value="255"/>';
// Seconds as a smooth number, for the animations that move between ticks.
const SECS = '([SECOND] + [MILLISECOND] / 1000)';

const colorCfg = (id, list, prefix) =>
  `    <ColorConfiguration id="${id}" displayName="@string/cfg_${id}" defaultValue="0">\n` +
  list.map((o, i) => `      <ColorOption id="${i}" displayName="@string/${prefix}_${i}" colors="${o[1]}"/>`).join('\n') +
  `\n    </ColorConfiguration>`;

const font = (family, size, weight, color) => `<Font family="${family}" size="${n2(size)}" weight="${weight}" slant="NORMAL" color="${color}"`;
const textPart = (x, y, w, h, align, family, size, weight, color, param, extra = '') =>
  `<PartText x="${ni(x)}" y="${ni(y)}" width="${ni(w)}" height="${ni(h)}">${extra}
          <Text align="${align}">${font(family, size, weight, color)}><Template><![CDATA[%s]]><Parameter expression="${param}"/></Template></Font></Text>
        </PartText>`;

// ---- the eight arc slots (the format allows no more than eight complication slots in all) ----
// The bottom slot (4) is the fasting one: its data draws its own arc and also the stage bar under the clock.
// Slot k sits at k * 45 degrees clockwise from the top. Each is a 36 degree arc, with its value and label just inside it.
const ARC_R = 182; // design units: the arc centre line, 16 px short of the screen edge so the glass does not clip it
const R = ARC_R * SC;
const STROKE = 8;
const HALF = 18;
const SLOTS = [
  { name: 'Top', value: '10.0k', label: 'Steps', svc: 'StepsComplicationService', type: 'RANGED_VALUE', fb: 'STEP_COUNT', fbType: 'RANGED_VALUE' },
  { name: 'Upper right', value: '78', label: 'Ready', svc: 'ReadinessComplicationService', type: 'RANGED_VALUE', fb: 'WATCH_BATTERY', fbType: 'RANGED_VALUE' },
  { name: 'Right', value: '64', label: 'Heart', svc: 'HeartComplicationService', type: 'RANGED_VALUE', fb: 'HEART_RATE', fbType: 'SHORT_TEXT' },
  { name: 'Lower right', value: '7h12', label: 'Sleep', svc: 'SleepComplicationService', type: 'RANGED_VALUE', fb: 'WATCH_BATTERY', fbType: 'RANGED_VALUE' },
  { name: 'Bottom', value: '14:20', label: 'Fast', svc: 'FastingBarComplicationService', type: 'RANGED_VALUE', fb: 'WATCH_BATTERY', fbType: 'RANGED_VALUE', fast: true },
  { name: 'Lower left', value: 'Start', label: 'Ky Fit', svc: 'KyComplicationService', type: 'SHORT_TEXT', fb: 'DAY_OF_WEEK', fbType: 'SHORT_TEXT' },
  { name: 'Left', value: '1.4L', label: 'Water', svc: 'WaterComplicationService', type: 'RANGED_VALUE', fb: 'WATCH_BATTERY', fbType: 'RANGED_VALUE' },
  { name: 'Upper left', value: '52%', label: 'Month', svc: 'MonthGoalComplicationService', type: 'RANGED_VALUE', fb: 'WATCH_BATTERY', fbType: 'RANGED_VALUE' },
];
const COMPONENT = (svc) => `com.kyfitness.app/com.kyfitness.wear.${svc}`;
const FRAC = '([COMPLICATION.RANGED_VALUE_VALUE] - [COMPLICATION.RANGED_VALUE_MIN]) / ([COMPLICATION.RANGED_VALUE_MAX] - [COMPLICATION.RANGED_VALUE_MIN])';

// Digits sit a little below the middle of a text box (the font's line is 1.2 em tall with the baseline 1.0 em down), so boxes are
// centred 0.05 em above where the digits should look centred.
const boxFor = (centreY, size) => centreY - 0.05 * size;

// Value and label sizes (design units) and where they sit relative to the block's centre line.
const V_SIZE = 30;
const L_SIZE = 17;
const V_DY = -8.5;
const L_DY = 15.5;

const geometry = (k, s) => {
  const a = k * 45;
  const ux = Math.sin((a * Math.PI) / 180);
  const uy = -Math.cos((a * Math.PI) / 180);
  // How far the value block reaches toward the arc, so the gap to the arc is the same all round (design units).
  const hw = Math.max((s.value.length * 0.46 * V_SIZE) / 2, (s.label.length * 0.42 * L_SIZE) / 2) + 2;
  const top = -V_DY + 0.35 * V_SIZE;
  const bottom = L_DY + 0.55 * L_SIZE;
  const reach = hw * Math.abs(ux) + (uy < 0 ? top : bottom) * Math.abs(uy);
  const rr = ARC_R - 7 / 2 - 7 - reach;
  return { a, ux, uy, cx: 200 + rr * ux, cy: 200 + rr * uy };
};

const arcXml = (a0, a1, expr, color) =>
  `<Arc centerX="225" centerY="225" width="${n2(R * 2)}" height="${n2(R * 2)}" startAngle="${n2(a0)}" endAngle="${n2(a1)}" direction="CLOCKWISE">` +
  `${expr ? `<Transform target="endAngle" value="${esc(`${n2(a0)} + ${n2(a1 - a0)} * clamp(${expr}, 0, 1)`)}"/>` : ''}<Stroke color="${color}" thickness="${STROKE}" cap="ROUND"/></Arc>`;

// The fasting data source packs hours, goal and bar length into one range with a negative minimum; any other source has min >= 0 and
// gets an ordinary arc and no bar.
const FAST_FRAC = '([COMPLICATION.RANGED_VALUE_MIN] < 0 ? [COMPLICATION.RANGED_VALUE_VALUE] / (0 - [COMPLICATION.RANGED_VALUE_MIN]) : ' + FRAC + ')';

// Slot ids. Positions 4 and 5 swapped contents and got fresh ids (8 and 9). Note the watch keeps a user's picks by position, so this did
// not reset their choices; do not reorder slots again without telling the user to re-pick them in the editor.
const SLOT_ID = [0, 1, 2, 3, 8, 9, 6, 7];

const slotXml = (s, k) => {
  const g = geometry(k, s);
  const a0 = g.a - HALF;
  const a1 = g.a + HALF;
  const x = P(g.cx);
  const y = P(g.cy);
  const vSize = V_SIZE * SC;
  const lSize = L_SIZE * SC;
  const vCentre = P(g.cy + V_DY);
  const lCentre = P(g.cy + L_DY);
  const vBox = [x - 60, boxFor(vCentre, vSize) - 24, 120, 48];
  const lBox = [x - 70, boxFor(lCentre, lSize) - 16, 140, 32];
  const texts = `${textPart(...vBox, 'CENTER', 'barlow_condensed_700', vSize, 'BOLD', INK, '[COMPLICATION.TEXT]', `\n          ${AMB}`)}
        ${textPart(...lBox, 'CENTER', 'barlow_condensed_600', lSize, 'SEMI_BOLD', DIM, '[COMPLICATION.TITLE]', `\n          ${AMB}`)}`;
  const draw = (expr) => `<PartDraw x="0" y="0" width="450" height="450" tintColor="${TH(ARC_COLOR[k])}">
          ${AMB}
          ${arcXml(a0, a1, expr, '#ffffffff')}
        </PartDraw>`;
  // A complication is only drawn inside its bounding shape (and that is also its tap area), so the box must hold the arc, the value,
  // the label and, for the fasting slot, the stage bar.
  const rects = [vBox, lBox];
  for (let a = a0; a <= a1 + 0.01; a += 3) {
    const px0 = 225 + (R + STROKE / 2 + 2) * Math.sin((a * Math.PI) / 180);
    const py0 = 225 - (R + STROKE / 2 + 2) * Math.cos((a * Math.PI) / 180);
    const pxi = 225 + (R - STROKE / 2 - 2) * Math.sin((a * Math.PI) / 180);
    const pyi = 225 - (R - STROKE / 2 - 2) * Math.cos((a * Math.PI) / 180);
    rects.push([Math.min(px0, pxi), Math.min(py0, pyi), Math.abs(px0 - pxi), Math.abs(py0 - pyi)]);
  }
  if (s.fast) rects.push([BAR_X - 16, BAR_Y - 18, BAR_W + 32, 36]);
  const bx0 = Math.max(0, Math.floor(Math.min(...rects.map((r) => r[0])) - 3));
  const by0 = Math.max(0, Math.floor(Math.min(...rects.map((r) => r[1])) - 3));
  const bx1 = Math.min(450, Math.ceil(Math.max(...rects.map((r) => r[0] + r[2])) + 3));
  const by1 = Math.min(450, Math.ceil(Math.max(...rects.map((r) => r[1] + r[3])) + 3));
  return `    <ComplicationSlot slotId="${SLOT_ID[k]}" supportedTypes="RANGED_VALUE SHORT_TEXT EMPTY" x="0" y="0" width="450" height="450" displayName="@string/slot_${SLOT_ID[k]}" isCustomizable="TRUE">
      <DefaultProviderPolicy defaultSystemProvider="${s.fb}" defaultSystemProviderType="${s.fbType}" primaryProvider="${COMPONENT(s.svc)}" primaryProviderType="${s.type}"/>
      <BoundingBox x="${bx0}" y="${by0}" width="${bx1 - bx0}" height="${by1 - by0}"/>
      <Complication type="RANGED_VALUE">
        ${draw(s.fast ? FAST_FRAC : FRAC)}
        ${texts}${s.fast ? `
        ${barGroup()}` : ''}
      </Complication>
      <Complication type="SHORT_TEXT">
        ${draw(null)}
        ${texts}
      </Complication>
    </ComplicationSlot>`;
};

// ---- the fasting stage bar (same geometry and colours as the phone's FastBarRenderer) ----
// The data source packs three numbers into one ranged value: value = hours fasted, min = minus the goal in hours, max = the length of
// the bar in hours (see FastingBarComplicationService).
const BAR_X = P(112);
const BAR_W = 176 * SC;
const BAR_Y = 284; // under the clock (digits end at 265), above the lower side values
const BAR_TH = 8 * SC;
const GAP = BAR_TH * 0.42;
const H = '[COMPLICATION.RANGED_VALUE_VALUE]';
const G = '(0 - [COMPLICATION.RANGED_VALUE_MIN])';
const T = '[COMPLICATION.RANGED_VALUE_MAX]';
const BOUNDS = [0, 4, 12, 16, 20];
const edge = (i) => (i < 5 ? String(BOUNDS[i]) : T);
const px = (hours) => `${n2(BAR_X)} + (${hours}) * ${n2(BAR_W)} / ${T}`;
const startX = (i) => `${px(edge(i))}${i ? ` + ${n2(GAP / 2)}` : ''}`;
const endX = (i) => `${px(edge(i + 1))}${i < 4 ? ` - ${n2(GAP / 2)}` : ''}`;

const barGroup = () => {
  const parts = [];
  const rr = (extra, y, h, rx, fill) => `<RoundRectangle x="0" y="${n2(y)}" width="10" height="${n2(h)}" cornerRadiusX="${n2(rx)}" cornerRadiusY="${n2(rx)}">${extra}<Fill color="${fill}"/></RoundRectangle>`;
  // A stage colour is the phone's fixed colour with the accent laid over it at half strength (the phone's own blend), so each coloured
  // piece is drawn twice: the stage colour, then the accent on top.
  for (let i = 0; i < 5; i++) {
    const xs = startX(i);
    const xe = endX(i);
    const sc = argb(STAGE[i]).slice(3);
    const trackT = `<Transform target="x" value="${esc(xs)}"/><Transform target="width" value="${esc(`(${xe}) - (${xs})`)}"/>`;
    const fillW = `clamp(${px(`clamp(${H}, ${BOUNDS[i]}, ${edge(i + 1)})`)} - (${xs}), 0, (${xe}) - (${xs}))`;
    const fillT = `<Transform target="x" value="${esc(xs)}"/><Transform target="width" value="${esc(fillW)}"/>`;
    const track = (fill) => rr(trackT, BAR_Y - BAR_TH / 2, BAR_TH, BAR_TH / 2, fill);
    const glow = (fill) => rr(fillT, BAR_Y - BAR_TH, BAR_TH * 2, BAR_TH, fill);
    const fillR = (fill) => rr(fillT, BAR_Y - BAR_TH / 2, BAR_TH, BAR_TH / 2, fill);
    // The faint track of the whole stage, a soft wash under what is filled, then the fill.
    parts.push(`<PartDraw x="0" y="0" width="450" height="450">
          ${AMB}
          ${track('#40' + sc)}
          ${glow('#30' + sc)}
          ${fillR('#ff' + sc)}
        </PartDraw>`);
    parts.push(`<PartDraw x="0" y="0" width="450" height="450" tintColor="${TH(0)}">
          ${AMB}
          ${track('#18ffffff')}
          ${fillR('#80ffffff')}
        </PartDraw>`);
    // Ambient: just an outline of the stage.
    parts.push(`<PartDraw x="0" y="0" width="450" height="450" alpha="0">
          ${AMB_ONLY}
          <RoundRectangle x="0" y="${n2(BAR_Y - BAR_TH / 2)}" width="10" height="${n2(BAR_TH)}" cornerRadiusX="${n2(BAR_TH / 2)}" cornerRadiusY="${n2(BAR_TH / 2)}">${trackT}<Stroke color="#ff6b6a66" thickness="1"/></RoundRectangle>
        </PartDraw>`);
  }
  // The goal tick.
  parts.push(`<PartDraw x="0" y="0" width="450" height="450" tintColor="${INK}">
          <Rectangle x="0" y="${n2(BAR_Y - BAR_TH * 1.05)}" width="2.5" height="${n2(BAR_TH * 2.1)}"><Transform target="x" value="${esc(`${px(`clamp(${G}, 0, ${T})`)} - 1.25`)}"/><Fill color="#ffffffff"/></Rectangle>
        </PartDraw>`);
  // The dot on the front of the fill: a pulsing halo, a bright ring and a core in the colour of the stage you are in.
  const inStage = (lo, hi) => `(${H} >= ${lo} && ${H} < ${hi} ? 1 : 0)`;
  const dotX = esc(`${px(`clamp(${H}, 0, ${T})`)} - 15`);
  const bounds = [0.02, 4, 12, 16, 20, 1000];
  const dot = (tint, alphaExpr, r, fill) => `<PartDraw x="0" y="${n2(BAR_Y - 15)}" width="30" height="30"${tint ? ` tintColor="${tint}"` : ''}>
          ${AMB}
          <Transform target="x" value="${dotX}"/>
          <Transform target="alpha" value="${esc(alphaExpr)}"/>
          <Ellipse x="${n2(15 - r)}" y="${n2(15 - r)}" width="${n2(r * 2)}" height="${n2(r * 2)}"><Fill color="${fill}"/></Ellipse>
        </PartDraw>`;
  for (let i = 0; i < 5; i++) {
    const mask = inStage(bounds[i], bounds[i + 1]);
    const sc = argb(STAGE[i]);
    parts.push(dot(null, `${mask} * (115 + 70 * sin(${SECS} * 2.618))`, BAR_TH * 1.35, sc));
  }
  parts.push(dot(INK, `${H} > 0.02 ? 255 : 0`, BAR_TH * 0.78, '#ffffffff'));
  for (let i = 0; i < 5; i++) {
    const mask = inStage(bounds[i], bounds[i + 1]);
    parts.push(dot(null, `${mask} * 255`, BAR_TH * 0.42, argb(STAGE[i])));
    parts.push(dot(TH(0), `${mask} * 128`, BAR_TH * 0.42, '#ffffffff'));
  }
  // Shown only when the slot holds the fasting source (its minimum is negative: minus the goal).
  return `<Group name="fastbar" x="0" y="0" width="450" height="450">
          <Transform target="alpha" value="${esc('[COMPLICATION.RANGED_VALUE_MIN] < 0 ? 255 : 0')}"/>
        ${parts.join('\n        ')}
        </Group>`;
};

// ---- the clock ----
// Hours end just left of the colon and minutes start just right of it, so the colon never moves while the digits change width.
const TIME_SIZE = 116 * SC;
const timeCentre = P(195.5);
const timeBoxY = boxFor(timeCentre, TIME_SIZE) - 80;
const colonW = 0.252 * TIME_SIZE + 4;
const timeText = (fmt, align, x, w, color, amb) =>
  `<TimeText format="${fmt}" hourFormat="SYNC_TO_DEVICE" align="${align}" x="${ni(x)}" y="${ni(timeBoxY)}" width="${ni(w)}" height="160" alpha="${amb ? 0 : 255}">
        <Variant mode="AMBIENT" target="alpha" value="${amb ? 255 : 0}"/>
        <Font family="barlow_condensed_600" size="${n2(TIME_SIZE)}" weight="SEMI_BOLD" slant="NORMAL" color="${color}"/>
      </TimeText>`;
const clockXml = () => {
  const left = 225 - colonW / 2;
  const right = 225 + colonW / 2;
  const parts = [];
  for (const amb of [false, true]) {
    const c = amb ? '#ffd0d0d0' : INK;
    parts.push(timeText('hh', 'END', 20, left - 20, c, amb));
    parts.push(timeText('mm', 'START', right, 430 - right, c, amb));
  }
  // The colon breathes in the live face and is steady in ambient mode. A lone colon is not a valid time format, so it is plain text.
  const colon = (amb) => `    <PartText x="${ni(left)}" y="${ni(timeBoxY)}" width="${ni(colonW)}" height="160" alpha="${amb ? 0 : 255}">
      <Variant mode="AMBIENT" target="alpha" value="${amb ? 255 : 0}"/>${amb ? '' : `
      <Transform target="alpha" value="${esc(`165 + 90 * sin(${SECS} * 3.1416)`)}"/>`}
      <Text align="CENTER">${font('barlow_condensed_600', TIME_SIZE, 'SEMI_BOLD', amb ? '#ffd0d0d0' : TH(0))}><Template><![CDATA[%s]]><Parameter expression="&quot;:&quot;"/></Template></Font></Text>
    </PartText>`;
  return `    <DigitalClock x="0" y="0" width="450" height="450">
      ${parts.join('\n      ')}
    </DigitalClock>
${colon(false)}
${colon(true)}`;
};

// ---- the date: the weekday in the accent, day and month muted ----
const DATE_SIZE = 28.5 * SC;
const dateBoxY = boxFor(P(136.5), DATE_SIZE) - 20;
// The day and month go in one text part so they stay together.
const dateParts = () => `    <PartText x="40" y="${ni(dateBoxY)}" width="180" height="40">
      ${AMB}
      <Text align="END">${font('barlow_condensed_600', DATE_SIZE, 'SEMI_BOLD', TH(0))}><Template><![CDATA[%s]]><Parameter expression="[DAY_OF_WEEK_S]"/></Template></Font></Text>
    </PartText>
    <PartText x="230" y="${ni(dateBoxY)}" width="180" height="40">
      ${AMB}
      <Text align="START">${font('barlow_condensed_600', DATE_SIZE, 'SEMI_BOLD', DIM)}><Template><![CDATA[%s %s]]><Parameter expression="[DAY]"/><Parameter expression="[MONTH_S]"/></Template></Font></Text>
    </PartText>
    <PartText x="0" y="${ni(dateBoxY)}" width="450" height="40" alpha="0">
      ${AMB_ONLY}
      <Text align="CENTER">${font('barlow_condensed_600', DATE_SIZE, 'SEMI_BOLD', '#ff8a8a85')}><Template><![CDATA[%s %s %s]]><Parameter expression="[DAY_OF_WEEK_S]"/><Parameter expression="[DAY]"/><Parameter expression="[MONTH_S]"/></Template></Font></Text>
    </PartText>`;

// ---- the static scene: background, arc tracks, orbit rail and seconds dot ----
const RAIL = (ARC_R + 8) * SC;
const sceneBase = `    <PartDraw x="0" y="0" width="450" height="450">
      ${AMB}
      <Rectangle x="0" y="0" width="450" height="450"><Fill color="${BG}"/></Rectangle>
    </PartDraw>
    <PartDraw x="0" y="0" width="450" height="450" tintColor="${INK}">
      ${AMB}
      <Ellipse x="${n2(225 - RAIL)}" y="${n2(225 - RAIL)}" width="${n2(RAIL * 2)}" height="${n2(RAIL * 2)}"><Stroke color="#12ffffff" thickness="1"/></Ellipse>
      ${SLOTS.map((s, k) => arcXml(k * 45 - HALF, k * 45 + HALF, null, '#1affffff')).join('\n      ')}
    </PartDraw>
    <PartDraw x="0" y="0" width="450" height="450" alpha="0">
      ${AMB_ONLY}
      ${SLOTS.map((s, k) => arcXml(k * 45 - HALF, k * 45 + HALF, null, '#ff4a4a47').replace(`thickness="${STROKE}"`, 'thickness="1.5"')).join('\n      ')}
    </PartDraw>
    <PartDraw x="0" y="0" width="450" height="450" pivotX="0.5" pivotY="0.5" angle="0" tintColor="${TH(0)}">
      ${AMB}
      <Transform target="angle" value="${esc(`${SECS} * 6`)}"/>
      <Transform target="alpha" value="[CONFIGURATION.dot] * 255"/>
      <Ellipse x="${n2(225 - 3.4)}" y="${n2(225 - RAIL - 3.4)}" width="6.8" height="6.8"><Fill color="#ffffffff"/></Ellipse>
    </PartDraw>`;

const xml = `<?xml version="1.0"?>
<!--
    Minimal Fitness digital watch face (generated by generate-watchface.cjs; edit that, not this file).
    Eight arcs round the rim, each a complication; a fasting bar under the clock; a seconds dot.
    Edit it from the Pixel Watch app or by long-pressing the face: colour scheme, background, seconds dot, and every complication.
-->
<WatchFace width="450" height="450">
  <Metadata key="CLOCK_TYPE" value="DIGITAL"/>
  <Metadata key="PREVIEW_TIME" value="10:42:30"/>

  <UserConfigurations>
${colorCfg('theme', themes, 'theme')}
${colorCfg('bg', bgOptions, 'bg')}
    <ListConfiguration id="dot" displayName="@string/cfg_dot" defaultValue="1">
      <ListOption id="1" displayName="@string/dot_on"/>
      <ListOption id="0" displayName="@string/dot_off"/>
    </ListConfiguration>
  </UserConfigurations>
  <Scene backgroundColor="#ff000000">

${sceneBase}

${dateParts()}

${clockXml()}

${SLOTS.map((s, k) => slotXml(s, k)).join('\n\n')}

  </Scene>
</WatchFace>
`;
fs.writeFileSync(path.join(res, 'raw', 'watchface.xml'), xml);

// ---- strings ----
const names = (list, prefix) => list.map((o, i) => `    <string name="${prefix}_${i}">${o[0]}</string>`).join('\n');
const strings = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="watch_face_name">Minimal Fitness Digital</string>
    <string name="cfg_theme">Colour scheme</string>
    <string name="cfg_bg">Background</string>
    <string name="cfg_dot">Seconds dot</string>
    <string name="dot_on">On</string>
    <string name="dot_off">Off</string>
${SLOTS.map((s, k) => `    <string name="slot_${SLOT_ID[k]}">${s.name}</string>`).join('\n')}
${names(themes, 'theme')}
${names(bgOptions, 'bg')}
</resources>
`;
fs.writeFileSync(path.join(res, 'values', 'strings.xml'), strings);
console.log('generated', xml.length, 'bytes,', themes.length, 'colour schemes');
