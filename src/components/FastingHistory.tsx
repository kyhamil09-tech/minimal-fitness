import React, { useState } from 'react';
import { Award, Flame, Timer, Trash2, TrendingUp } from 'lucide-react';
import { FastingSession } from '../types/health';
import { ColorPalette } from '../types/theme';
import { BarChart } from './ui/charts';
import { FeelingChips } from './FastingFeelings';
import { completedFasts, fastingByDay, fastingStats } from '../lib/fasting';
import { shortMonthDay, todayKey } from '../lib/dates';

interface FastingHistoryProps {
  sessions: FastingSession[];
  theme: ColorPalette;
  onDelete: (id: string) => void;
}

const fmtHours = (h: number) => {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return mm === 0 ? `${hh}h` : `${hh}h ${mm}m`;
};

export const FastingHistory: React.FC<FastingHistoryProps> = ({ sessions, theme, onDelete }) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const today = todayKey();
  const done = completedFasts(sessions);
  const stats = fastingStats(sessions, today);
  const days = fastingByDay(sessions, today, 14);
  const goal = done[0]?.targetDurationHours;
  const shown = showAll ? done : done.slice(0, 8);

  return (
    <section className="rounded-3xl border p-5 space-y-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4" style={{ color: theme.primary }} />
          <h3 className="gh-title" style={{ fontSize: '1.05rem' }}>Fasting history</h3>
        </div>
        <span className="text-[11px] text-neutral-400">{stats.total} completed</span>
      </div>

      {done.length === 0 ? (
        <div className="rounded-2xl glass-inset p-5 text-center space-y-1.5">
          <Timer className="w-7 h-7 mx-auto text-neutral-400" />
          <p className="text-sm font-semibold text-white">No completed fasts yet</p>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Start a fast above and tap <strong>End</strong> when you eat, or use <strong>Log Fast</strong> to add one you did
            earlier. Your history, streak and weekly chart will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl glass-inset p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-400"><Flame className="w-3.5 h-3.5 text-orange-300" />Streak</div>
              <div className="text-xl font-semibold text-white tabular-nums mt-1">{stats.streakDays} <span className="text-xs font-medium text-neutral-400">day{stats.streakDays === 1 ? '' : 's'}</span></div>
              <div className="text-[11px] text-neutral-500">in a row with a goal met</div>
            </div>
            <div className="rounded-2xl glass-inset p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-400"><TrendingUp className="w-3.5 h-3.5 text-emerald-300" />Goal rate</div>
              <div className="text-xl font-semibold text-white tabular-nums mt-1">{stats.successRate}%</div>
              <div className="text-[11px] text-neutral-500">{stats.goalMet} of {stats.total} reached</div>
            </div>
            <div className="rounded-2xl glass-inset p-3">
              <div className="text-[11px] text-neutral-400">Average fast</div>
              <div className="text-xl font-semibold text-white tabular-nums mt-1">{fmtHours(stats.avgHours)}</div>
              <div className="text-[11px] text-neutral-500">{fmtHours(stats.totalHours)} in total</div>
            </div>
            <div className="rounded-2xl glass-inset p-3">
              <div className="text-[11px] text-neutral-400">Longest fast</div>
              <div className="text-xl font-semibold text-white tabular-nums mt-1">{fmtHours(stats.longestHours)}</div>
              <div className="text-[11px] text-neutral-500">personal best</div>
            </div>
          </div>

          <div className="rounded-2xl glass-inset p-3">
            <div className="text-[11px] text-neutral-400 mb-1">Last 14 days (hours fasted)</div>
            <BarChart
              data={days.map((d, i) => ({ label: shortMonthDay(d.key).split(' ')[1] ?? '', value: d.hours, highlight: i === days.length - 1 }))}
              color={theme.primary}
              height={110}
              goal={goal}
              format={(v) => `${Math.round(v)}`}
              ariaLabel="Hours fasted per day over the last 14 days"
            />
          </div>

          <div className="space-y-2.5">
            {shown.map((session) => {
              const actual = session.actualHours ?? session.targetDurationHours;
              const met = actual >= session.targetDurationHours;
              const delta = actual - session.targetDurationHours;
              return (
                <div key={session.id} className="rounded-2xl glass-inset p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white">{session.fastProtocolName}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${met ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>
                          {met ? 'Goal reached' : 'Partial'}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-1">
                        {new Date(session.startTimestamp).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        {session.endTimestamp ? ` → ${new Date(session.endTimestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
                      </div>
                      {session.notes && <div className="text-[11px] text-neutral-300 mt-1">“{session.notes}”</div>}
                      {session.checkIns && session.checkIns.length > 0 && (
                        <div className="mt-1.5">
                          <FeelingChips tags={[...new Set(session.checkIns.flatMap((c) => c.tags))]} />
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-semibold tabular-nums text-white">{fmtHours(actual)}</div>
                      <div className={`text-[10px] tabular-nums ${delta >= 0 ? 'text-emerald-400' : 'text-neutral-500'}`}>
                        {delta >= 0 ? `+${fmtHours(delta)} over goal` : `${fmtHours(-delta)} short`}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end mt-2">
                    {confirmId === session.id ? (
                      <span className="flex items-center gap-2 text-[11px]">
                        <span className="text-neutral-400">Delete this fast?</span>
                        <button onClick={() => { onDelete(session.id); setConfirmId(null); }} className="text-rose-400 font-bold">Yes</button>
                        <button onClick={() => setConfirmId(null)} className="text-neutral-400">No</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmId(session.id)} className="text-[11px] flex items-center gap-1 text-neutral-500 hover:text-rose-400">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {done.length > 8 && (
            <button onClick={() => setShowAll((v) => !v)} className="w-full py-2 rounded-xl glass-inset text-xs font-semibold text-white">
              {showAll ? 'Show fewer' : `Show all ${done.length} fasts`}
            </button>
          )}
        </>
      )}
    </section>
  );
};