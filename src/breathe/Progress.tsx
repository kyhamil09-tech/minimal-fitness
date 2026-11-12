import React, { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { BreathSession, breathStats, breathTotals, dailyMinutes, favouriteTechnique, patternById } from '../lib/breathing';
import { journeyLabel } from './content';
import { BreatheSettings } from './settings';
import { BrToggle, SectionTitle, clock } from './ui';
import { AMBIENTS } from './settings';
import { BreatheReminder } from '../lib/breatheReminder';

const WEEKDAY = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' });

/** Your history: streak and minutes, the week as bars, what you use most, how you felt afterwards, and the cues. */
export const Progress: React.FC<{
  log: BreathSession[];
  settings: BreatheSettings;
  onSettings: (s: BreatheSettings) => void;
  hue: string;
  onDelete: (id: string) => void;
  reminder: BreatheReminder;
  onReminder: (r: BreatheReminder) => void;
}> = ({ log, settings, onSettings, hue, onDelete, reminder, onReminder }) => {
  const stats = useMemo(() => breathStats(log, Date.now()), [log]);
  const totals = useMemo(() => breathTotals(log), [log]);
  const week = useMemo(() => dailyMinutes(log, Date.now(), 7), [log]);
  const fav = useMemo(() => favouriteTechnique(log), [log]);
  const max = Math.max(5, ...week.map((d) => d.minutes));

  return (
    <div className="br-scroll">
      <h1 className="br-h1 mt-3">Progress</h1>

      <div className="br-card mt-4 grid grid-cols-3 text-center">
        <div>
          <div className="br-num">{stats.streakDays}</div>
          <div className="br-dim text-xs">day streak</div>
        </div>
        <div>
          <div className="br-num">{totals.minutes}</div>
          <div className="br-dim text-xs">minutes in all</div>
        </div>
        <div>
          <div className="br-num">{stats.totalSessions}</div>
          <div className="br-dim text-xs">sessions</div>
        </div>
      </div>

      <SectionTitle>The last 7 days</SectionTitle>
      <div className="br-card">
        <div className="flex h-24 items-end gap-2" role="img" aria-label={`Minutes breathed each day this week: ${week.map((d) => d.minutes).join(', ')}`}>
          {week.map((d) => (
            <div key={d.key} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="w-full rounded-t-md" style={{ height: `${d.minutes === 0 ? 3 : 8 + (d.minutes / max) * 62}px`, backgroundColor: hue, opacity: d.minutes === 0 ? 0.2 : 0.9 }} />
              <span className="br-dim text-[10px]">{WEEKDAY(d.key)}</span>
            </div>
          ))}
        </div>
        <p className="br-dim mt-3 text-xs">
          {stats.weekMinutes} minutes in {stats.weekSessions} {stats.weekSessions === 1 ? 'session' : 'sessions'} this week.
        </p>
      </div>

      {(fav || totals.avgBpmChange !== null || totals.avgCalm !== null) && (
        <>
          <SectionTitle>What it does for you</SectionTitle>
          <div className="br-card space-y-3 text-sm">
            {fav && (
              <div className="flex justify-between gap-3">
                <span className="br-dim">Most used</span>
                <span className="font-semibold">
                  {patternById(fav.patternId).name} · {fav.count}×
                </span>
              </div>
            )}
            {totals.avgCalm !== null && (
              <div className="flex justify-between gap-3">
                <span className="br-dim">How calm you feel after</span>
                <span className="font-semibold">{totals.avgCalm} out of 5</span>
              </div>
            )}
            {totals.avgBpmChange !== null && (
              <div className="flex justify-between gap-3">
                <span className="br-dim">Heart rate over a session</span>
                <span className="font-semibold">
                  {totals.avgBpmChange > 0 ? '+' : ''}
                  {totals.avgBpmChange} bpm on average
                </span>
              </div>
            )}
            <p className="br-dim text-xs">From your own sessions, once there are enough of them. Heart rate needs a watch or strap.</p>
          </div>
        </>
      )}

      <SectionTitle>Daily reminder</SectionTitle>
      <div className="br-card !p-0">
        <BrToggle label="Remind me" sub="A short note at the same time each day" on={reminder.on} onChange={(v) => onReminder({ ...reminder, on: v })} />
        {reminder.on && (
          <>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--br-line)' }}>
              <label htmlFor="br-reminder-time" className="text-sm font-semibold">
                Time
              </label>
              <input id="br-reminder-time" type="time" value={reminder.time} onChange={(e) => onReminder({ ...reminder, time: e.target.value })} className="br-input !w-32" />
            </div>
            <BrToggle label="A gentler note after a few days away" sub="No pressure, just a nudge" on={reminder.nudge} onChange={(v) => onReminder({ ...reminder, nudge: v })} />
          </>
        )}
      </div>
      <p className="br-dim mt-2 px-1 text-xs">The reminder skips a day you have already breathed.</p>

      <SectionTitle>Session cues</SectionTitle>
      <div className="br-card !p-0">
        <BrToggle label="Buzz" sub="A small vibration at each part of the breath" on={settings.haptics} onChange={(v) => onSettings({ ...settings, haptics: v })} />
        <BrToggle label="Chimes" sub="A soft tone at each part of the breath" on={settings.tones} onChange={(v) => onSettings({ ...settings, tones: v })} />
        <BrToggle label="Voice" sub="Spoken words for the first breaths, and for guided sessions" on={settings.voice} onChange={(v) => onSettings({ ...settings, voice: v })} />
        <BrToggle label="Eyes closed" sub="The screen goes black during a session. Tap to look." on={settings.eyesClosed} onChange={(v) => onSettings({ ...settings, eyesClosed: v })} />
        <BrToggle label="Bells" sub="At the start and end of a silent or guided sit" on={settings.bells} onChange={(v) => onSettings({ ...settings, bells: v })} />
      </div>
      <div className="br-card mt-3">
        <div className="text-sm font-semibold">Background sound</div>
        <p className="br-dim mt-0.5 text-xs">Soft sound made on the phone, under any session.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Background sound">
          {AMBIENTS.map((a) => (
            <button key={a.id} type="button" className="br-chip" aria-pressed={settings.ambient === a.id} onClick={() => onSettings({ ...settings, ambient: a.id })}>
              {a.label}
            </button>
          ))}
        </div>
        {settings.ambient !== 'off' && (
          <label className="br-dim mt-3 flex items-center gap-3 text-xs">
            Volume
            <input type="range" min={0.1} max={1} step={0.05} value={settings.ambientVolume} onChange={(e) => onSettings({ ...settings, ambientVolume: Number(e.target.value) })} aria-label="Background sound volume" className="flex-1" />
          </label>
        )}
      </div>

      <SectionTitle>History</SectionTitle>
      {log.length === 0 ? (
        <p className="br-dim px-1 text-sm">Nothing yet. Your sessions will appear here.</p>
      ) : (
        <ul className="space-y-2">
          {log.slice(0, 30).map((s) => (
            <li key={s.id} className="br-card flex items-center justify-between gap-3 !py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{patternById(s.patternId).name}</div>
                <div className="br-dim truncate text-xs">
                  {clock(s.seconds)}
                  {s.bpmStart && s.bpmEnd ? ` · ${s.bpmStart} → ${s.bpmEnd} bpm` : ''}
                  {s.after ? ` · calm ${s.after}/5` : ''} · {new Date(s.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
                {journeyLabel(s) && <div className="truncate text-xs font-semibold" style={{ color: hue }}>{journeyLabel(s)}</div>}
              </div>
              <button type="button" className="br-icon-btn shrink-0" onClick={() => onDelete(s.id)} aria-label={`Delete the ${patternById(s.patternId).name} session`}>
                <Trash2 className="h-4 w-4 opacity-70" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="h-4" />
    </div>
  );
};
