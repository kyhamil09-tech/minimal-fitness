import React, { useMemo, useState } from 'react';
import { CalendarRange, Share2 } from 'lucide-react';
import { FastingSession, WorkoutSession } from '../types/health';
import { UnitSystem } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { StoryData, buildYearStory } from '../lib/storyCards';
import { yearReview, yearsWithData } from '../lib/yearReview';
import { distanceUnit, kmToDisplay } from '../lib/units';
import { shortMonthDay } from '../lib/dates';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;

/** The year in numbers: workouts, time, distance, a bar for each month, the highlights, and a story card to share. */
export const YearInReview: React.FC<{ theme: ColorPalette; workouts: WorkoutSession[]; fasts: FastingSession[]; units: UnitSystem; onShare: (data: StoryData) => void }> = ({ theme, workouts, fasts, units, onShare }) => {
  const years = useMemo(() => yearsWithData(workouts), [workouts]);
  const [picked, setPicked] = useState<number | null>(null);
  const year = picked ?? years[0];
  const r = useMemo(() => (year ? yearReview(workouts, fasts, year) : null), [workouts, fasts, year]);
  if (!r) return null;
  const top = Math.max(1, ...r.byMonth);
  const unit = distanceUnit(units);

  return (
    <section className="rounded-[28px] border p-5 space-y-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }} aria-label={`${r.year} in review`}>
      <div className="flex items-center gap-2">
        <CalendarRange className="h-4 w-4" style={{ color: theme.primary }} aria-hidden="true" />
        <h3 className="gh-title" style={{ fontSize: '1.05rem' }}>
          {r.year} in review
        </h3>
      </div>
      {years.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Year">
          {years.map((y) => (
            <button key={y} type="button" aria-pressed={y === year} onClick={() => setPicked(y)} className="sport-pill !py-1.5 !px-3.5 !text-xs">
              {y}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Workouts', value: String(r.workouts) },
          { label: 'Active days', value: String(r.activeDays) },
          { label: 'Time', value: hm(r.minutes) },
          { label: 'Distance', value: `${kmToDisplay(r.distanceKm, units, 0)} ${unit}` },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl p-3" style={{ backgroundColor: 'var(--card2)' }}>
            <div className="stat-label">{s.label}</div>
            <div className="hero-num text-2xl text-white">{s.value}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="stat-label mb-1.5">Workouts each month</div>
        <div className="flex h-24 items-end gap-1" role="img" aria-label={`Workouts by month: ${r.byMonth.map((c, i) => `${MONTHS[i]} ${c}`).join(', ')}`}>
          {r.byMonth.map((c, i) => (
            <div key={MONTHS[i]} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t-md" style={{ height: `${c === 0 ? 3 : 8 + (c / top) * 64}px`, backgroundColor: theme.primary, opacity: r.bestMonth?.month === i ? 1 : c === 0 ? 0.2 : 0.5 }} />
              <span className="text-[10px] text-neutral-400">{MONTHS[i].slice(0, 1)}</span>
            </div>
          ))}
        </div>
      </div>

      <ul className="space-y-1.5 text-xs text-neutral-300">
        {r.topSports.length > 0 && (
          <li>
            <strong className="text-white">Top activities:</strong> {r.topSports.map((s) => `${s.type} (${s.count})`).join(', ')}
          </li>
        )}
        {r.bestMonth && (
          <li>
            <strong className="text-white">Best month:</strong> {MONTHS[r.bestMonth.month]}, {r.bestMonth.count} workouts
          </li>
        )}
        {r.longest && (
          <li>
            <strong className="text-white">Longest:</strong> {kmToDisplay(r.longest.km, units, 1)} {unit} {r.longest.type.toLowerCase()} on {shortMonthDay(r.longest.date)}
          </li>
        )}
        {r.biggestWeek && (
          <li>
            <strong className="text-white">Biggest week:</strong> {kmToDisplay(r.biggestWeek.km, units, 0)} {unit}, from {shortMonthDay(r.biggestWeek.from)}
          </li>
        )}
        {r.longestStreak > 1 && (
          <li>
            <strong className="text-white">Longest streak:</strong> {r.longestStreak} days in a row
          </li>
        )}
        {r.fasts.count > 0 && (
          <li>
            <strong className="text-white">Fasts finished:</strong> {r.fasts.count}, longest {r.fasts.longestHours} h
          </li>
        )}
      </ul>

      <button
        type="button"
        onClick={() => onShare(buildYearStory(r, units))}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-extrabold"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        <Share2 className="h-4 w-4" aria-hidden="true" /> Share my {r.year}
      </button>
    </section>
  );
};
