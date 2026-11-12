import React from 'react';
import { Check, SmilePlus, X } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { FastingSession } from '../types/health';
import { FAST_STAGES, FEELING_TAGS, checkInCount, feelingLabel, feelingMap, feelingTone, hoursInto, stageIndexAt } from '../lib/fasting';

const hm = (hours: number) => {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
};

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const toneClass = (tone: 'good' | 'bad') => (tone === 'good' ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/25' : 'bg-amber-400/15 text-amber-300 border-amber-400/25');

/** Small read-only tag chips for a list of tag ids. */
export const FeelingChips: React.FC<{ tags: string[] }> = ({ tags }) => (
  <div className="flex flex-wrap gap-1.5">
    {tags.map((t) => (
      <span key={t} className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${toneClass(feelingTone(t))}`}>
        {feelingLabel(t)}
      </span>
    ))}
  </div>
);

interface CheckInProps {
  theme: ColorPalette;
  session: FastingSession;
  now: number;
  picked: string[];
  onToggle: (id: string) => void;
  onSave: () => void;
  onRemove: (at: number) => void;
}

/** The "how do you feel right now" card shown while a fast runs: tap tags, save, and each check-in is stamped with the stage. */
export const FastingCheckInCard: React.FC<CheckInProps> = ({ theme, session, now, picked, onToggle, onSave, onRemove }) => {
  const hours = hoursInto(session, now);
  const stage = FAST_STAGES[stageIndexAt(hours)];
  const done = session.checkIns ?? [];
  return (
    <section className="rounded-3xl border p-5 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SmilePlus className="w-4 h-4" style={{ color: theme.primary }} />
          <h3 className="gh-title" style={{ fontSize: '1.05rem' }}>How do you feel?</h3>
        </div>
        <span className="text-xs text-neutral-400 text-right">
          {stage.name} · {hm(hours)} in
        </span>
      </div>
      <p className="text-xs text-neutral-400 leading-relaxed">Tap everything that fits right now. Over a few fasts this shows which feelings come with which stage.</p>

      <div role="group" aria-label="How you feel" className="flex flex-wrap gap-2">
        {FEELING_TAGS.map((t) => {
          const on = picked.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onToggle(t.id)}
              className={`flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                on ? '' : 'border-[#1A1E26] text-neutral-300 hover:border-neutral-600'
              }`}
              style={on ? { backgroundColor: `${theme.primary}22`, borderColor: theme.primary, color: '#fff' } : undefined}
            >
              <span
                className={`w-4 h-4 rounded-md border flex items-center justify-center ${on ? '' : 'border-neutral-600'}`}
                style={on ? { backgroundColor: theme.primary, borderColor: theme.primary } : undefined}
              >
                {on && <Check className="w-3 h-3 text-black" strokeWidth={3.5} />}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={picked.length === 0}
        className="w-full py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-40 transition-opacity"
        style={{ backgroundColor: theme.primary }}
      >
        {picked.length === 0 ? 'Pick how you feel' : `Save check-in (${picked.length})`}
      </button>

      {done.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="text-sm text-neutral-200 font-bold">This fast</div>
          {[...done].reverse().map((c) => (
            <div key={c.at} className="rounded-2xl glass-inset p-3 flex items-start justify-between gap-3">
              <div className="space-y-1.5 min-w-0">
                <div className="text-xs text-neutral-400">
                  {clock(c.at)} · {hm(hoursInto(session, c.at))} in · {FAST_STAGES[stageIndexAt(hoursInto(session, c.at))].short}
                </div>
                <FeelingChips tags={c.tags} />
              </div>
              <button type="button" onClick={() => onRemove(c.at)} aria-label="Remove this check-in" className="text-neutral-400 hover:text-rose-400 shrink-0 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

/** Across all fasts: for each stage, how many check-ins there were and which feelings came up most. */
export const FeelingMapCard: React.FC<{ theme: ColorPalette; sessions: FastingSession[] }> = ({ theme, sessions }) => {
  const total = checkInCount(sessions);
  const map = feelingMap(sessions);
  return (
    <section className="rounded-3xl border p-5 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center justify-between">
        <h3 className="gh-title" style={{ fontSize: '1.05rem' }}>Feelings by stage</h3>
        <span className="text-xs text-neutral-400">{total} check-in{total === 1 ? '' : 's'}</span>
      </div>
      {total === 0 ? (
        <p className="text-xs text-neutral-400 leading-relaxed">
          Check in while you fast and this fills in: for every stage you will see which feelings show up most, so you can spot when energy peaks or hunger hits.
        </p>
      ) : (
        <div className="space-y-2.5">
          {map.map((st) => (
            <div key={st.stageId} className="rounded-2xl glass-inset p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{st.name}</span>
                <span className="text-xs text-neutral-400">{st.checkIns} check-in{st.checkIns === 1 ? '' : 's'}</span>
              </div>
              {st.tags.length === 0 ? (
                <div className="text-xs text-neutral-400 mt-1">Nothing logged here yet</div>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {st.tags.slice(0, 4).map((t) => (
                    <div key={t.id} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-xs text-neutral-300 truncate">{feelingLabel(t.id)}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${t.share}%`, backgroundColor: feelingTone(t.id) === 'good' ? '#6EE7B7' : '#FBBF24' }}
                        />
                      </div>
                      <span className="w-9 text-right text-xs tabular-nums text-neutral-400">{t.share}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
