import React from 'react';
import { Check, ExternalLink, ShieldAlert } from 'lucide-react';
import { SHARE_ITEMS, SHARE_SECTIONS, shareGranted, type ShareId, type ShareMap } from '../lib/hcShare';
import { HealthConnect, type HcStatus } from '../lib/native';

interface HealthShareChecklistProps {
  share: ShareMap;
  onChange: (next: ShareMap) => void;
  /** Latest Health Connect status, for showing which ticked items still need Android's permission. */
  hc: HcStatus | null | undefined;
  /** Opens Android's permission pop-up for one feature group. */
  askFor: (groups: string[]) => void;
  accent: string;
}

/**
 * "Choose what to send": one tick box per kind of data, grouped, with a plain warning that other apps allowed in Health Connect can
 * read whatever is sent. Ticking an item also asks Android for just that permission; unticking stops sending immediately.
 */
export const HealthShareChecklist: React.FC<HealthShareChecklistProps> = ({ share, onChange, hc, askFor, accent }) => {
  const ticked = SHARE_ITEMS.filter((i) => share[i.id]).length;
  const toggle = (id: ShareId, group: string, on: boolean) => {
    onChange({ ...share, [id]: on });
    if (on) {
      const item = SHARE_ITEMS.find((i) => i.id === id);
      if (item && hc && !shareGranted(item, hc.missing)) askFor([group]);
    }
  };
  const setAll = (on: boolean) => onChange(Object.fromEntries(SHARE_ITEMS.map((i) => [i.id, on])) as ShareMap);

  return (
    <div className="px-4 pb-3 space-y-3" role="group" aria-label="Choose what to send to Health Connect">
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Anything you send can be read by every other app you have allowed in Health Connect, such as Fitbit, Google Health or Strava. Some of those
          apps upload to their own cloud. Nothing is sent unless it is ticked here, and unticking stops it straight away.
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-bold text-neutral-200">Choose what to send</div>
        <div className="flex gap-2 text-xs font-semibold">
          <button type="button" className="min-h-11 px-2 text-neutral-300 hover:text-white" onClick={() => setAll(true)}>
            Tick all
          </button>
          <button type="button" className="min-h-11 px-2 text-neutral-300 hover:text-white" onClick={() => setAll(false)}>
            Clear
          </button>
        </div>
      </div>
      {SHARE_SECTIONS.map((section) => (
        <div key={section} className="space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{section}</div>
          {SHARE_ITEMS.filter((i) => i.section === section).map((item) => {
            const on = share[item.id];
            const needs = on && hc && !shareGranted(item, hc.missing);
            return (
              <button
                key={item.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(item.id, item.group, !on)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-1 text-left"
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border"
                  style={on ? { backgroundColor: accent, borderColor: accent } : { borderColor: '#4B5563' }}
                  aria-hidden="true"
                >
                  {on && <Check className="w-4 h-4 text-black" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">
                    {item.label}
                    {item.sensitive && <span className="ml-2 text-[10px] font-bold uppercase text-amber-300">Personal</span>}
                  </span>
                  <span className="block text-xs text-neutral-400">{needs ? 'Waiting for Android permission. Tap to allow.' : item.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
      <div className="text-xs text-neutral-400">
        {ticked === 0 ? 'Nothing is being sent.' : `${ticked} kind${ticked === 1 ? '' : 's'} of data will be sent.`} Receiving from Health Connect is separate and
        is not affected by this list.
      </div>
      <button
        type="button"
        onClick={() => HealthConnect.openSettings().catch(() => undefined)}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-neutral-700 px-4 text-xs font-semibold text-neutral-200 hover:text-white"
      >
        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        See which apps can read it, in Health Connect
      </button>
    </div>
  );
};
