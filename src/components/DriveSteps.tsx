import React, { useState } from 'react';
import { Car, ChevronDown, Undo2 } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { AutomaticData } from '../hooks/useAutomaticData';
import { usePrefs } from '../lib/prefs';
import { Removed } from '../lib/steps';
import { todayKey } from '../lib/dates';
import { Toggle } from './ui/SettingsParts';
import { StepPeriods } from './StepPeriods';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** The most steps any source took out of a period: the sources count the same walking, so the largest is "how many". */
const mostRemoved = (r: Removed) => Math.max(r.phone ?? 0, r.watch ?? 0, r.hc ?? 0);

interface DriveStepsProps {
  theme: ColorPalette;
  automation: AutomaticData;
  android: boolean;
}

/**
 * Driving and steps. A car shakes the phone and the wrist, and both count it as walking. The Android app notices by itself when
 * you are in a vehicle (the phone's own activity recognition, no account) and takes those steps off the day; here you can switch that
 * off, see today's drives, put one back, or add one the phone missed.
 */
export const DriveSteps: React.FC<DriveStepsProps> = ({ theme, automation, android }) => {
  const { prefs, setPrefs } = usePrefs();
  const [manual, setManual] = useState(false);
  const today = todayKey();
  const drivesToday = automation.stepWindows.filter((w) => w.date === today).sort((a, b) => a.fromMs - b.fromMs);

  return (
    <div className="rounded-2xl border border-[#1A1E26] bg-black/40 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Car className="w-4 h-4 mt-0.5 shrink-0" style={{ color: theme.primary }} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Driving</div>
            <p className="text-xs text-[#9AA3B2] leading-relaxed mt-0.5">
              {android
                ? 'A car shakes the phone and your wrist into counting steps. The phone notices when you are in a vehicle and takes those steps off the day.'
                : 'Automatic driving detection works in the Android app. You can still take a drive off by hand below.'}
            </p>
          </div>
        </div>
        {android && <Toggle on={prefs.autoDriveSteps} onChange={(v) => setPrefs({ autoDriveSteps: v })} label="Leave out steps while driving" />}
      </div>

      {drivesToday.length > 0 && (
        <ul className="divide-y divide-[#1A1E26] border-t border-[#1A1E26]">
          {drivesToday.map((w) => (
            <li key={w.id} className="py-2 flex items-center gap-2">
              <div className="min-w-0 flex-1 text-xs text-neutral-200">
                Drive {hhmm(w.fromMs)}–{hhmm(w.toMs)}
                <span className="text-[#9AA3B2]"> · {mostRemoved(w.removed).toLocaleString()} steps left out</span>
              </div>
              <button
                onClick={() => automation.removeStepWindow(w.id)}
                className="p-2 rounded-lg border border-neutral-700 text-neutral-300 hover:text-white shrink-0"
                aria-label={`Put back the steps from the drive ${hhmm(w.fromMs)} to ${hhmm(w.toMs)}`}
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => setManual((v) => !v)}
        aria-expanded={manual}
        className="flex items-center gap-1 text-xs font-semibold text-neutral-300 hover:text-white"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${manual ? 'rotate-180' : ''}`} />
        {manual ? 'Hide' : 'Add a drive by hand, or review earlier ones'}
      </button>
      {manual && (
        <div className="pt-3 border-t border-[#1A1E26]">
          <StepPeriods theme={theme} automation={automation} />
        </div>
      )}
    </div>
  );
};
