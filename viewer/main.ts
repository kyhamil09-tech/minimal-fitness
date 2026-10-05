import { Model, buildModel, dayTotals, daysBetween, dailyToCsv, gpxZip, movingSec, needsPassphrase, paceSecPerKm, readBackupText, rollingMean, sleepToCsv, weeklySums } from './model';
import { workoutsToCsv } from '../src/lib/backup';
import { addDays, toDateKey } from '../src/lib/dates';
import { banister, formState } from '../src/lib/banister';
import { dailyLoad } from '../src/lib/trainingLoad';
import { buildInsights, insightReadiness } from '../src/lib/insights';
import { findRoutes, routeLabel, workoutPoints } from '../src/lib/routes';
import { bestEfforts, computeSplits, formatDuration, formatPaceSec, personalBests, toGpx } from '../src/lib/workoutStats';
import { workoutEfficiency } from '../src/lib/aerobicTrend';
import { formatRaceTime, predictRaces } from '../src/lib/racePrediction';
import { hm, sleepRegularityIndex } from '../src/lib/sleepMetrics';
import { WorkoutSession } from '../src/types/health';

type Tab = 'overview' | 'heatmap' | 'compare' | 'sleep' | 'training' | 'routes' | 'insights' | 'export';
const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['heatmap', 'Year heatmap'],
  ['compare', 'Compare runs'],
  ['sleep', 'Sleep & HRV'],
  ['training', 'Training load'],
  ['routes', 'Routes'],
  ['insights', 'Insights'],
  ['export', 'Export'],
];

const S = {
  model: null as Model | null,
  tab: 'overview' as Tab,
  year: new Date().getFullYear(),
  metric: 'km' as 'km' | 'min' | 'load',
  miles: false,
  sleepRange: 180,
  trainRange: 365,
  type: 'Running',
  picked: [] as string[],
  pending: null as string | null,
  error: '',
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const KM_MI = 1.609344;
const dist = (km: number) => `${((S.miles ? km / KM_MI : km)).toFixed(km >= 100 ? 0 : 1)} ${S.miles ? 'mi' : 'km'}`;
const pace = (secPerKm: number | null) => (secPerKm ? `${formatPaceSec(S.miles ? secPerKm * KM_MI : secPerKm)}/${S.miles ? 'mi' : 'km'}` : '-');
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
const PALETTE = ['#9ccc00', '#5CC8FF', '#FF8A5C', '#C58BFF'];

// ------------------------------------------------------------------ charts

interface Series {
  name: string;
  color: string;
  pts: [number, number][];
  faint?: boolean;
  bars?: boolean;
}

const niceTicks = (lo: number, hi: number, n = 5): number[] => {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
};

const chart = (series: Series[], o: { h?: number; xFmt: (x: number) => string; yFmt?: (y: number) => string; flip?: boolean; zero?: boolean }): string => {
  const all = series.flatMap((s) => s.pts);
  if (all.length < 2) return '<p class="muted">Not enough data in this range yet.</p>';
  const W = 760;
  const H = o.h ?? 230;
  const L = 46, R = 10, T = 10, B = 24;
  let x0 = Math.min(...all.map((p) => p[0]));
  let x1 = Math.max(...all.map((p) => p[0]));
  let y0 = Math.min(...all.map((p) => p[1]));
  let y1 = Math.max(...all.map((p) => p[1]));
  if (o.zero) y0 = Math.min(0, y0);
  if (y1 === y0) y1 = y0 + 1;
  const pad = (y1 - y0) * 0.06;
  if (!o.zero) y0 -= pad;
  y1 += pad;
  if (x1 === x0) x1 = x0 + 1;
  const X = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const Y = (y: number) => (o.flip ? T + ((y - y0) / (y1 - y0)) * (H - T - B) : H - B - ((y - y0) / (y1 - y0)) * (H - T - B));
  const yf = o.yFmt ?? ((v: number) => String(Math.round(v * 10) / 10));
  let g = '';
  for (const t of niceTicks(y0, y1)) g += `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" class="grid"/><text x="${L - 6}" y="${Y(t) + 4}" class="axis" text-anchor="end">${esc(yf(t))}</text>`;
  for (let i = 0; i <= 4; i++) {
    const x = x0 + ((x1 - x0) * i) / 4;
    g += `<text x="${X(x)}" y="${H - 6}" class="axis" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${esc(o.xFmt(x))}</text>`;
  }
  for (const s of series) {
    if (s.bars) {
      const bw = Math.max(1, ((W - L - R) / s.pts.length) * 0.7);
      g += s.pts.map(([x, y]) => `<rect x="${X(x) - bw / 2}" y="${Y(y)}" width="${bw}" height="${Math.max(0, Y(Math.max(0, y0)) - Y(y))}" fill="${s.color}" opacity=".85"/>`).join('');
    } else {
      const d = s.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join('');
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.faint ? 1 : 2.2}" opacity="${s.faint ? 0.45 : 1}" stroke-linejoin="round"/>`;
    }
  }
  const legend = series.filter((s) => !s.faint).map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${g}</svg><div class="legend">${legend}</div>`;
};

// ------------------------------------------------------------------ pieces

const stat = (label: string, value: string, sub = '') => `<div class="stat"><div class="k">${esc(label)}</div><div class="v">${esc(value)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</div>`;
const card = (title: string, body: string, cls = '') => `<section class="card ${cls}"><h2>${esc(title)}</h2>${body}</section>`;

const inRange = <T>(rows: T[], at: (r: T) => number, days: number): T[] => {
  if (!days) return rows;
  const from = Date.now() - days * 86_400_000;
  return rows.filter((r) => at(r) >= from);
};

const rangePicker = (name: 'sleepRange' | 'trainRange', opts: [number, string][]) =>
  `<div class="seg">${opts.map(([v, l]) => `<button data-set="${name}" data-v="${v}" class="${S[name] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

// ------------------------------------------------------------------ screens

const overview = (m: Model): string => {
  const runs = m.workouts.filter((w) => w.type === 'Running');
  const km = m.workouts.reduce((s, w) => s + (w.distanceKm ?? 0), 0);
  const hours = m.workouts.reduce((s, w) => s + (w.durationSec ?? w.durationMinutes * 60), 0) / 3600;
  const sri = sleepRegularityIndex(m.sleep);
  const avgSleep = m.sleep.length ? m.sleep.reduce((s, l) => s + l.durationMinutes, 0) / m.sleep.length : 0;
  const span = Math.max(1, daysBetween(m.firstDay, m.today));
  const effs = m.workouts.flatMap((w) => bestEfforts(w).map((e) => ({ distanceM: e.target.km * 1000, seconds: e.seconds })));
  const pred = predictRaces(effs);
  const monthly = new Map<string, number>();
  for (const w of m.workouts) {
    const k = toDateKey(w.startedAt as number).slice(0, 7);
    monthly.set(k, (monthly.get(k) ?? 0) + (w.distanceKm ?? 0));
  }
  const bars: [number, number][] = [...monthly.entries()].sort().map(([k, v]) => [Date.parse(k + '-15'), S.miles ? v / KM_MI : v]);
  const pbs = personalBests(m.workouts);
  return `
  <div class="stats">
    ${stat('Workouts', String(m.workouts.length), `${runs.length} runs`)}
    ${stat('Distance', dist(km), `over ${Math.round(span / 7)} weeks`)}
    ${stat('Time moving', `${hours.toFixed(0)} h`)}
    ${stat('Nights of sleep', String(m.sleep.length), avgSleep ? `${hm(avgSleep)} average` : '')}
    ${stat('Sleep regularity', sri ? String(Math.round(sri.sri)) : '-', sri?.label ?? 'needs 5 nights with detail')}
  </div>
  ${card('Distance each month', chart([{ name: S.miles ? 'miles' : 'km', color: PALETTE[0], pts: bars, bars: true }], { xFmt: shortDate, zero: true }))}
  <div class="two">
    ${card('Personal bests', pbs.length ? `<table>${pbs.map((p) => `<tr><td>${esc(p.target.label)}</td><td class="num">${formatRaceTime(p.seconds)}</td><td class="muted">${fmtDate(p.at)}</td></tr>`).join('')}</table>` : '<p class="muted">Needs GPS runs.</p>')}
    ${card('Race predictions', pred ? `<table>${pred.predictions.map((p) => `<tr><td>${esc(p.label)}</td><td class="num">${formatRaceTime(p.seconds)}</td></tr>`).join('')}</table><p class="muted">From your best effort (VDOT ${pred.basis.vdot}). A guide, not a promise.</p>` : '<p class="muted">Needs a GPS run of 1.5 km or more.</p>')}
  </div>`;
};

const heatmap = (m: Model): string => {
  const totals = dayTotals(m.workouts);
  const years = [...new Set(m.workouts.map((w) => new Date(w.startedAt as number).getFullYear()))].sort();
  if (!years.length) return card('Year heatmap', '<p class="muted">No workouts in this backup.</p>');
  if (!years.includes(S.year)) S.year = years[years.length - 1];
  const pick = (t: { km: number; min: number; load: number }) => (S.metric === 'km' ? t.km : S.metric === 'min' ? t.min : t.load);
  const start = new Date(S.year, 0, 1);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  let max = 0;
  for (const [k, t] of totals) if (k.startsWith(String(S.year))) max = Math.max(max, pick(t));
  const cell = 15, gap = 3, left = 28, top = 18;
  let g = '';
  const mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let yearKm = 0, active = 0, longest = 0, run = 0;
  for (let c = 0; c < 54; c++) {
    for (let r = 0; r < 7; r++) {
      const d = new Date(start);
      d.setDate(start.getDate() + c * 7 + r);
      if (d.getFullYear() !== S.year) continue;
      const key = toDateKey(d);
      const t = totals.get(key);
      const v = t ? pick(t) : 0;
      const level = !t || max <= 0 ? 0 : v <= 0 ? 1 : 1 + Math.min(3, Math.floor((Math.sqrt(v / max)) * 4 - 1e-9));
      if (t) { active++; yearKm += t.km; run++; longest = Math.max(longest, run); } else run = 0;
      const tip = t ? `${key}: ${t.count} workout${t.count > 1 ? 's' : ''}, ${dist(t.km)}, ${Math.round(t.min)} min (${[...new Set(t.names)].join(', ')})` : key;
      g += `<rect x="${left + c * (cell + gap)}" y="${top + r * (cell + gap)}" width="${cell}" height="${cell}" rx="3" class="h${level}"><title>${esc(tip)}</title></rect>`;
      if (r === 0 && d.getDate() <= 7) g += `<text x="${left + c * (cell + gap)}" y="12" class="axis">${mNames[d.getMonth()]}</text>`;
    }
  }
  ['Mon', 'Wed', 'Fri'].forEach((n, i) => (g += `<text x="0" y="${top + i * 2 * (cell + gap) + 12}" class="axis">${n}</text>`));
  const W = left + 54 * (cell + gap);
  const H = top + 7 * (cell + gap);
  return card(
    `${S.year} at a glance`,
    `<div class="row">
       <div class="seg">${years.map((y) => `<button data-set="year" data-v="${y}" class="${y === S.year ? 'on' : ''}">${y}</button>`).join('')}</div>
       <div class="seg">${(['km', 'min', 'load'] as const).map((k) => `<button data-set="metric" data-v="${k}" class="${S.metric === k ? 'on' : ''}">${k === 'km' ? 'Distance' : k === 'min' ? 'Time' : 'Load'}</button>`).join('')}</div>
     </div>
     <div class="scroll"><svg viewBox="0 0 ${W} ${H}" class="heat" style="min-width:${W}px">${g}</svg></div>
     <div class="stats mini">${stat('Active days', String(active))}${stat('Distance', dist(yearKm))}${stat('Longest streak', `${longest} d`)}</div>`
  );
};

const typeOptions = (m: Model): string[] => [...new Set<string>(m.workouts.map((w) => w.type))].sort();

const compare = (m: Model): string => {
  const types = typeOptions(m);
  if (!types.includes(S.type)) S.type = types[0] ?? 'Running';
  const list = m.workouts.filter((w) => w.type === S.type).slice().reverse();
  const picked = S.picked.map((id) => m.workouts.find((w) => w.id === id)).filter((w): w is WorkoutSession => !!w);
  const rows = list.slice(0, 400).map((w) => {
    const on = S.picked.includes(w.id);
    return `<tr data-pick="${esc(w.id)}" class="${on ? 'sel' : ''}"><td>${on ? '●' : '○'}</td><td>${fmtDate(w.startedAt as number)}</td><td class="num">${w.distanceKm ? dist(w.distanceKm) : '-'}</td><td class="num">${formatDuration(movingSec(w))}</td><td class="num">${pace(paceSecPerKm(w))}</td><td class="num">${w.avgHeartRate || '-'}</td></tr>`;
  });
  let compareBody = '<p class="muted">Pick two to four workouts from the list to see them side by side.</p>';
  if (picked.length) {
    const col = (w: WorkoutSession, i: number) => `<span class="dot" style="background:${PALETTE[i]}"></span>${fmtDate(w.startedAt as number)}`;
    const ef = picked.map(workoutEfficiency);
    const line = (label: string, f: (w: WorkoutSession, i: number) => string) => `<tr><th>${label}</th>${picked.map((w, i) => `<td class="num">${f(w, i)}</td>`).join('')}</tr>`;
    const table = `<table class="cmp"><tr><th></th>${picked.map((w, i) => `<th>${col(w, i)}</th>`).join('')}</tr>
      ${line('Distance', (w) => (w.distanceKm ? dist(w.distanceKm) : '-'))}
      ${line('Moving time', (w) => formatDuration(movingSec(w)))}
      ${line('Pace', (w) => pace(paceSecPerKm(w)))}
      ${line('Avg heart rate', (w) => String(w.avgHeartRate || '-'))}
      ${line('Climb', (w) => (w.elevationGainM !== undefined ? `${Math.round(w.elevationGainM)} m` : '-'))}
      ${line('Cadence', (w) => (w.cadenceAvg ? String(Math.round(w.cadenceAvg)) : '-'))}
      ${line('Efficiency', (_, i) => (ef[i] ? ef[i]!.adjustedEf.toFixed(2) : '-'))}
      ${line('Heart-rate drift', (_, i) => (ef[i]?.drift ? `${ef[i]!.drift!.decouplingPct.toFixed(1)}%` : '-'))}
    </table>`;
    const splitSeries = (pick: 'pace' | 'hr'): Series[] =>
      picked.map((w, i) => {
        const sp = w.track && w.track.length > 1 ? computeSplits(w.track, S.miles ? 'imperial' : 'metric', w.hrSeries) : [];
        const pts: [number, number][] = sp.filter((s) => !s.partial).map((s) => [s.index, pick === 'pace' ? s.paceSec : s.avgHr ?? NaN]);
        return { name: fmtDate(w.startedAt as number), color: PALETTE[i], pts: pts.filter((p) => Number.isFinite(p[1])) };
      });
    compareBody = `${table}
      <div class="two"><div><h3>Pace by ${S.miles ? 'mile' : 'km'}</h3>${chart(splitSeries('pace'), { xFmt: (x) => String(Math.round(x)), yFmt: (y) => formatPaceSec(y), flip: true, h: 200 })}</div>
      <div><h3>Heart rate by ${S.miles ? 'mile' : 'km'}</h3>${chart(splitSeries('hr'), { xFmt: (x) => String(Math.round(x)), h: 200 })}</div></div>
      <h3>Routes laid over each other</h3>${routeOverlay(picked)}`;
  }
  return `<div class="two wide">
    ${card('Pick workouts', `<div class="row"><select data-set="type">${types.map((t) => `<option ${t === S.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><span class="muted">${S.picked.length}/4 picked</span></div>
      <div class="list"><table><tr><th></th><th>Date</th><th>Distance</th><th>Time</th><th>Pace</th><th>HR</th></tr>${rows.join('')}</table></div>`)}
    ${card('Side by side', compareBody)}
  </div>`;
};

const routeOverlay = (ws: WorkoutSession[]): string => {
  const lines = ws.map((w) => workoutPoints(w));
  const all = lines.flat();
  if (all.length < 2) return '<p class="muted">None of these have a recorded route.</p>';
  const lat0 = all.reduce((s, p) => s + p[0], 0) / all.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const pr = all.map((p) => [p[1] * k, -p[0]] as [number, number]);
  const minX = Math.min(...pr.map((p) => p[0])), maxX = Math.max(...pr.map((p) => p[0]));
  const minY = Math.min(...pr.map((p) => p[1])), maxY = Math.max(...pr.map((p) => p[1]));
  const size = 320, pad = 10;
  const sc = (size - 2 * pad) / Math.max(1e-9, maxX - minX, maxY - minY);
  const paths = lines.map((pts, i) => {
    if (pts.length < 2) return '';
    const d = pts.map((p, j) => `${j ? 'L' : 'M'}${(pad + (p[1] * k - minX) * sc).toFixed(1)} ${(pad + (-p[0] - minY) * sc).toFixed(1)}`).join('');
    return `<path d="${d}" fill="none" stroke="${PALETTE[i]}" stroke-width="2.4" opacity=".9" stroke-linejoin="round"/>`;
  });
  return `<svg viewBox="0 0 ${size} ${size}" class="map">${paths.join('')}</svg>`;
};

const sleepScreen = (m: Model): string => {
  const logs = inRange(m.sleep, (l) => Date.parse(l.dateIso), S.sleepRange);
  const dur: [number, number][] = logs.map((l) => [Date.parse(l.dateIso), l.durationMinutes / 60]);
  const hrv: [number, number][] = logs.filter((l) => l.detail?.hrvMs).map((l) => [Date.parse(l.dateIso), l.detail!.hrvMs as number]);
  const eff: [number, number][] = logs.filter((l) => l.efficiencyScore).map((l) => [Date.parse(l.dateIso), l.efficiencyScore]);
  const deep: [number, number][] = logs.filter((l) => l.deepSleepMinutes).map((l) => [Date.parse(l.dateIso), l.deepSleepMinutes / 60]);
  const bed: [number, number][] = logs.filter((l) => l.bedtime).map((l) => {
    const [h, mi] = l.bedtime.split(':').map(Number);
    return [Date.parse(l.dateIso), (((h * 60 + mi - 18 * 60 + 1440) % 1440) / 60) + 18];
  });
  const hh = (v: number) => `${String(Math.floor(v) % 24).padStart(2, '0')}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`;
  const sri = sleepRegularityIndex(logs);
  return `${rangePicker('sleepRange', [[30, '30 d'], [90, '90 d'], [180, '6 mo'], [365, '1 yr'], [0, 'All']])}
  <div class="stats mini">${stat('Nights', String(logs.length))}${stat('Average', logs.length ? hm(logs.reduce((s, l) => s + l.durationMinutes, 0) / logs.length) : '-')}${stat('Regularity', sri ? String(Math.round(sri.sri)) : '-', sri?.label ?? '')}</div>
  ${card('Sleep length (hours)', chart([{ name: 'night', color: PALETTE[1], pts: dur, faint: true }, { name: '7-night average', color: PALETTE[0], pts: rollingMean(dur, 7) }], { xFmt: shortDate }))}
  ${card('Heart rate variability (ms)', hrv.length > 3 ? chart([{ name: 'night', color: PALETTE[2], pts: hrv, faint: true }, { name: '7-night average', color: PALETTE[0], pts: rollingMean(hrv, 7) }], { xFmt: shortDate }) : '<p class="muted">No overnight HRV in this range. It needs a watch that shares it.</p>')}
  <div class="two">
    ${card('Bedtime', chart([{ name: 'bedtime', color: PALETTE[3], pts: bed }], { xFmt: shortDate, yFmt: hh, h: 190 }))}
    ${card('Efficiency (%)', chart([{ name: 'efficiency', color: PALETTE[1], pts: eff }, ...(deep.length > 3 ? [] : [])], { xFmt: shortDate, h: 190 }))}
  </div>
  ${deep.length > 3 ? card('Deep sleep (hours)', chart([{ name: 'deep', color: PALETTE[3], pts: deep, faint: true }, { name: '7-night average', color: PALETTE[0], pts: rollingMean(deep, 7) }], { xFmt: shortDate, h: 190 })) : ''}`;
};

const training = (m: Model): string => {
  const total = Math.max(60, daysBetween(m.firstDay, m.today) + 1);
  const days = dailyLoad(m.workouts, Math.min(total + 42, 1500), m.today);
  const series = banister(days);
  const from = S.trainRange ? Math.max(0, series.length - S.trainRange) : 0;
  const view = series.slice(from);
  const t = (d: { date: string }) => Date.parse(d.date);
  const last = series[series.length - 1];
  const fs = last ? formState(last.form, last.fitness) : null;
  const totals = dayTotals(m.workouts);
  const weekStart = view.length ? view[0].date : m.firstDay;
  const weeks = weeklySums(totals, weekStart, m.today, (x) => x.km);
  return `${rangePicker('trainRange', [[90, '90 d'], [180, '6 mo'], [365, '1 yr'], [0, 'All']])}
  <div class="stats mini">${stat('Fitness', last ? last.fitness.toFixed(1) : '-', 'slow, 6-week load')}${stat('Fatigue', last ? last.fatigue.toFixed(1) : '-', 'fast, 1-week load')}${stat('Form', last ? last.form.toFixed(1) : '-', fs?.label ?? '')}</div>
  ${card('Fitness, fatigue and form', chart([{ name: 'Fitness', color: PALETTE[0], pts: view.map((d) => [t(d), d.fitness]) }, { name: 'Fatigue', color: PALETTE[2], pts: view.map((d) => [t(d), d.fatigue]) }, { name: 'Form', color: PALETTE[1], pts: view.map((d) => [t(d), d.form]) }], { xFmt: shortDate, h: 260 }))}
  ${card(`Weekly ${S.miles ? 'miles' : 'km'}`, chart([{ name: 'weekly distance', color: PALETTE[0], pts: weeks.map((w) => [Date.parse(w.week), S.miles ? w.value / KM_MI : w.value]), bars: true }], { xFmt: shortDate, zero: true, h: 200 }))}
  <p class="muted">Load is each workout's heart-rate-based score from the app. Workouts without heart rate add little, so the picture is best for runs with a watch.</p>`;
};

const routes = (m: Model): string => {
  const groups = findRoutes(m.workouts);
  if (!groups.length) return card('Routes you repeat', '<p class="muted">A route needs at least two GPS workouts that follow the same path.</p>');
  return groups
    .map((g) => {
      const o = g.outline;
      const lat0 = o.reduce((s, p) => s + p[0], 0) / o.length;
      const k = Math.cos((lat0 * Math.PI) / 180);
      const xs = o.map((p) => p[1] * k), ys = o.map((p) => -p[0]);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      const sc = 90 / Math.max(1e-9, Math.max(...xs) - minX, Math.max(...ys) - minY);
      const d = o.map((p, j) => `${j ? 'L' : 'M'}${(5 + (p[1] * k - minX) * sc).toFixed(1)} ${(5 + (-p[0] - minY) * sc).toFixed(1)}`).join('');
      const pts: [number, number][] = [...g.attempts].reverse().map((a) => [a.at, a.paceSecPerKm]);
      return card(
        `${routeLabel(g, S.miles)} · ${g.attempts.length} times`,
        `<div class="routehead"><svg viewBox="0 0 100 100" class="thumb"><path d="${d}" fill="none" stroke="${PALETTE[0]}" stroke-width="2.4"/></svg>
          <div><p>Best: <b>${formatDuration(g.best.seconds)}</b> on ${fmtDate(g.best.at)}</p>${g.trendPct !== undefined ? `<p class="muted">Latest 3 vs the 3 before: ${g.trendPct > 0 ? '+' : ''}${g.trendPct}% time</p>` : ''}</div></div>
          ${chart([{ name: 'pace', color: PALETTE[1], pts }], { xFmt: shortDate, yFmt: (y) => formatPaceSec(S.miles ? y * KM_MI : y), flip: true, h: 170 })}`
      );
    })
    .join('');
};

const insights = (m: Model): string => {
  const window = Math.min(1500, Math.max(120, daysBetween(m.firstDay, m.today) + 1));
  const input = { today: m.today, workouts: m.workouts, sleepLogs: m.sleep, days: m.days, fasts: m.fasts };
  const ready = insightReadiness(input);
  const list = buildInsights(input, 30, window);
  const head = `<p class="muted">Looked across ${window} days: ${ready.nights} nights, ${ready.workouts} workouts. These are patterns in your numbers, not proof of cause.</p>`;
  if (!list.length) return card('Insights', `${head}<p>Nothing stands out yet. More nights of sleep and runs with heart rate will help.</p>`);
  return `${head}<div class="insights">${list.map((i) => `<article class="ins ${i.tone}"><h3>${esc(i.title)}</h3><p>${esc(i.detail)}</p><span class="tag">${i.confidence} · ${i.n} days</span></article>`).join('')}</div>`;
};

const exportScreen = (m: Model): string => {
  const withRoute = m.workouts.filter((w) => (w.track?.length ?? 0) > 1 || (w.route?.length ?? 0) > 1).length;
  return card(
    'Take your data with you',
    `<p class="muted">Files are made in this page and saved by your browser. Nothing is sent anywhere.</p>
     <div class="buttons">
       <button data-export="workouts">Workouts (CSV)</button>
       <button data-export="sleep">Sleep (CSV)</button>
       <button data-export="daily">Daily summary (CSV)</button>
       <button data-export="gpx" ${withRoute ? '' : 'disabled'}>All routes (GPX, zipped) · ${withRoute}</button>
       ${S.picked.length ? `<button data-export="gpx-picked">Picked workouts (GPX) · ${S.picked.length}</button>` : ''}
     </div>`
  );
};

// ------------------------------------------------------------------ shell

const saveFile = (name: string, data: BlobPart, type: string) => {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const doExport = (kind: string) => {
  const m = S.model;
  if (!m) return;
  const day = m.today;
  if (kind === 'workouts') saveFile(`workouts-${day}.csv`, workoutsToCsv(m.workouts), 'text/csv');
  else if (kind === 'sleep') saveFile(`sleep-${day}.csv`, sleepToCsv(m.sleep), 'text/csv');
  else if (kind === 'daily') saveFile(`daily-${day}.csv`, dailyToCsv(m), 'text/csv');
  else if (kind === 'gpx') {
    const z = gpxZip(m.workouts);
    if (z) saveFile(`routes-${day}.zip`, z as BlobPart, 'application/zip');
  } else if (kind === 'gpx-picked') {
    const ws = S.picked.map((id) => m.workouts.find((w) => w.id === id)).filter((w): w is WorkoutSession => !!w);
    if (ws.length === 1) saveFile(`${toDateKey(ws[0].startedAt as number)}-${ws[0].type}.gpx`, toGpx(ws[0]), 'application/gpx+xml');
    else {
      const z = gpxZip(ws);
      if (z) saveFile(`picked-${day}.zip`, z as BlobPart, 'application/zip');
    }
  }
};

const render = () => {
  const root = $('app');
  const m = S.model;
  if (!m) {
    root.innerHTML = `<div class="drop" id="drop">
      <h1>Minimal Fitness viewer</h1>
      <p>Open a backup file from the app (Settings, Backup). It is read inside this page and never uploaded. This page cannot connect to the internet at all.</p>
      ${S.pending ? `<form id="pass"><label>Passphrase<input type="password" id="passin" autocomplete="off" autofocus></label><button>Unlock</button></form>` : `<label class="file">Choose backup file<input type="file" id="file" accept=".json,application/json,.txt"></label><p class="muted">or drop it here</p>`}
      ${S.error ? `<p class="err">${esc(S.error)}</p>` : ''}
    </div>`;
    return;
  }
  const screens: Record<Tab, (m: Model) => string> = { overview, heatmap, compare, sleep: sleepScreen, training, routes, insights, export: exportScreen };
  root.innerHTML = `<header><div><b>Minimal Fitness</b><span class="muted"> · backup from ${m.exportedAt ? fmtDate(Date.parse(m.exportedAt)) : 'unknown date'}</span></div>
    <div class="seg"><button data-set="miles" data-v="0" class="${S.miles ? '' : 'on'}">km</button><button data-set="miles" data-v="1" class="${S.miles ? 'on' : ''}">mi</button></div>
    <button id="close">Close file</button></header>
    <nav>${TABS.map(([id, l]) => `<button data-tab="${id}" class="${id === S.tab ? 'on' : ''}">${l}</button>`).join('')}</nav>
    <main>${screens[S.tab](m)}</main>`;
};

const open = async (file: File, passphrase?: string) => {
  S.error = '';
  try {
    const text = await file.text();
    if (!passphrase && needsPassphrase(text)) {
      pendingText = text;
      S.pending = file.name;
      return render();
    }
    const backup = await readBackupText(pendingText ?? text, passphrase);
    S.model = buildModel(backup);
    S.pending = null;
    pendingText = null;
    S.tab = 'overview';
    S.picked = [];
  } catch (e) {
    S.error = e instanceof Error ? e.message : String(e);
  }
  render();
};
let pendingText: string | null = null;

document.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  if (t.id === 'file' && (t as HTMLInputElement).files?.[0]) void open((t as HTMLInputElement).files![0]);
  else if (t.matches('select[data-set="type"]')) {
    S.type = t.value;
    S.picked = [];
    render();
  }
});

document.addEventListener('submit', (e) => {
  const f = e.target as HTMLElement;
  if (f.id !== 'pass') return;
  e.preventDefault();
  const pass = ($('passin') as HTMLInputElement).value;
  void (async () => {
    S.error = '';
    try {
      S.model = buildModel(await readBackupText(pendingText ?? '', pass));
      S.pending = null;
      pendingText = null;
    } catch (err) {
      S.error = err instanceof Error ? err.message : String(err);
    }
    render();
  })();
});

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-set],[data-pick],[data-export],#close');
  if (!el) return;
  if (el.dataset.tab) S.tab = el.dataset.tab as Tab;
  else if (el.dataset.set) {
    const k = el.dataset.set, v = el.dataset.v ?? '';
    if (k === 'miles') S.miles = v === '1';
    else if (k === 'year') S.year = Number(v);
    else if (k === 'metric') S.metric = v as typeof S.metric;
    else if (k === 'sleepRange') S.sleepRange = Number(v);
    else if (k === 'trainRange') S.trainRange = Number(v);
  } else if (el.dataset.pick) {
    const id = el.dataset.pick;
    S.picked = S.picked.includes(id) ? S.picked.filter((x) => x !== id) : [...S.picked, id].slice(-4);
  } else if (el.dataset.export) return doExport(el.dataset.export);
  else if (el.id === 'close') {
    S.model = null;
    S.picked = [];
  }
  render();
});

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f && !S.model) void open(f);
});

render();
void addDays;
