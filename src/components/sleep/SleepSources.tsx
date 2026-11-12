import React, { useEffect, useMemo } from 'react';
import { Watch } from 'lucide-react';
import { ColorPalette } from '../../types/theme';
import { SleepLogEntry } from '../../types/health';
import { usePrefs } from '../../lib/prefs';
import { applyPreference, sourceName, sourcesIn } from '../../lib/sleepSources';
import { Choice } from '../ui/SettingsParts';

interface SleepSourcesProps {
  theme: ColorPalette;
  logs: SleepLogEntry[];
  setLogs: React.Dispatch<React.SetStateAction<SleepLogEntry[]>>;
}

/**
 * Which trackers to use when more than one saved the same night (a watch and a band, say). The main tracker is the base of each night;
 * a secondary tracker fills in what the main one missed, such as the hours after the watch came off. Health Connect holds what every
 * tracker app shares, so a second tracker appears here once its own app is allowed to share sleep there.
 */
export const SleepSources: React.FC<SleepSourcesProps> = ({ theme, logs, setLogs }) => {
  const { prefs, setPrefs } = usePrefs();
  const sources = useMemo(() => sourcesIn(logs), [logs]);

  // A changed choice re-picks the nights it affects, now rather than at the next sync. Nights you switched by hand stay as they are.
  useEffect(() => {
    setLogs((prev) => applyPreference(prev, prefs.sleepSource, prefs.sleepSecondary));
  }, [prefs.sleepSource, prefs.sleepSecondary, setLogs]);

  // With Health Connect off the app reads nothing another tracker shares, so a second tracker's night (a band that kept recording after
  // the watch came off) cannot appear. Say so here, with a button, instead of leaving the night looking cut short with no explanation.
  if (!prefs.useHealthConnect) {
    return (
      <section
        aria-label="Sleep sources"
        className="rounded-3xl border p-5 space-y-3"
        style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
      >
        <div className="flex items-center gap-2 text-sm font-bold text-neutral-200">
          <Watch className="h-4 w-4" style={{ color: theme.secondary }} />
          Other trackers are not being read
        </div>
        <p className="text-xs text-[#9AA3B2] leading-relaxed">
          Health Connect is switched off in this app, so sleep from a band, ring or second watch is not read, and a night can end when the
          watch comes off. Turn it on to read what your other trackers share. It receives only: nothing you log is sent to Health Connect
          unless you switch that on separately, and nothing leaves your phone.
        </p>
        <button
          onClick={() => setPrefs({ useHealthConnect: true })}
          className="rounded-xl px-4 py-2 text-xs font-bold text-black"
          style={{ backgroundColor: theme.primary }}
        >
          Turn on Health Connect
        </button>
      </section>
    );
  }

  if (sources.length === 0) return null;
  // A tracker chosen earlier that has no nights now stays in the lists, so the choice is visible and can be changed.
  const known = (app: string) => app === 'auto' || app === 'none' || sources.some((s) => s.app === app);
  const trackers = sources.map((s) => ({ id: s.app, label: `${s.name} (${s.nights})` }));
  const extra = (app: string) => (known(app) ? [] : [{ id: app, label: `${sourceName(app)} (none yet)` }]);
  const mainOptions = [{ id: 'auto', label: 'Best available' }, ...trackers, ...extra(prefs.sleepSource)];
  const secondOptions = [
    { id: 'auto', label: 'Any other' },
    { id: 'none', label: 'None' },
    ...trackers.filter((t) => t.id !== prefs.sleepSource),
    ...extra(prefs.sleepSecondary),
  ];

  return (
    <section
      aria-label="Sleep sources"
      className="rounded-3xl border p-5 space-y-3"
      style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
    >
      <div className="flex items-center gap-2 text-sm font-bold text-neutral-200">
        <Watch className="h-4 w-4" style={{ color: theme.secondary }} />
        Sleep sources
      </div>
      {sources.length > 1 ? (
        <>
          <p className="text-xs text-[#9AA3B2] leading-relaxed">
            More than one tracker has saved your sleep. The main tracker is the base of each night. If you took it off early or it missed
            part of the night, the secondary tracker fills in the rest, so the night is not cut short. Open a night to switch just that one.
          </p>
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-neutral-300">Main tracker</div>
            <Choice<string> label="Main sleep tracker" value={prefs.sleepSource} options={mainOptions} onChange={(sleepSource) => setPrefs({ sleepSource })} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-neutral-300">Fill in from</div>
            <Choice<string> label="Secondary sleep tracker" value={prefs.sleepSecondary} options={secondOptions} onChange={(sleepSecondary) => setPrefs({ sleepSecondary })} />
          </div>
        </>
      ) : (
        <p className="text-xs text-[#9AA3B2] leading-relaxed">
          {`Your sleep comes from ${sources[0].name}. If you also wear a ring, band or second watch, allow its app to share sleep with Health Connect and it appears here, so you can pick a main tracker and a secondary one that fills in what the main one misses.`}
        </p>
      )}
    </section>
  );
};
