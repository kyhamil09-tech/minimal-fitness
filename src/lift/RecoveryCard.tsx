import React, { useMemo } from 'react';
import type { WorkoutSession } from '../types/health';
import { bestSplit, computeRecovery, stateOf } from '../lib/muscleRecovery';
import { useT } from '../lib/i18n';
import type { MessageKey } from '../locales/en';

/**
 * How recovered each muscle group is (see lib/muscleRecovery), with the freshest of push, pull and legs as the suggestion for today.
 * The bar and the percentage say it, and so does a word, so it does not rely on color.
 */
export const RecoveryCard: React.FC<{ workouts: WorkoutSession[] }> = ({ workouts }) => {
  const tr = useT();
  const rec = useMemo(() => computeRecovery(workouts), [workouts]);
  const best = bestSplit(rec);
  const trained = rec.some((r) => r.sets > 0);
  return (
    <>
      <h2 className="l-h2">{tr('rec.title')}</h2>
      <p className="l-dim mb-2 mt-1 text-xs">{tr('rec.sub')}</p>
      <div className="l-card space-y-2.5 p-4">
        {best && (
          <p className="text-sm font-bold" role="status">
            {tr('rec.best', { split: tr(`lp.day.${best.split}` as MessageKey), n: best.ready })}
          </p>
        )}
        {!trained && <p className="l-dim text-sm">{tr('rec.none')}</p>}
        {trained &&
          rec.map((r) => {
            const state = stateOf(r.score);
            return (
              <div key={r.group} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0">{tr(`rec.g.${r.group}` as MessageKey)}</span>
                <div className="l-bar flex-1" aria-hidden="true">
                  <span style={{ width: `${r.score}%`, opacity: state === 'fresh' ? 1 : state === 'recovering' ? 0.7 : 0.45 }} />
                </div>
                <span className="w-12 text-right tabular-nums" aria-label={`${r.score}%, ${tr(`rec.state.${state}` as MessageKey)}`}>
                  {r.score}%
                </span>
              </div>
            );
          })}
        {trained && (
          <ul className="l-dim grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1 text-[11px]">
            {rec
              .filter((r) => r.sets > 0)
              .map((r) => (
                <li key={r.group}>
                  {tr(`rec.g.${r.group}` as MessageKey)}: {tr(`rec.state.${stateOf(r.score)}` as MessageKey)}, {r.hoursSince === undefined ? tr('rec.never') : tr('rec.since', { n: r.hoursSince })}
                </li>
              ))}
          </ul>
        )}
      </div>
    </>
  );
};
