import React from 'react';
import { RefreshCw, Watch } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { WatchHeartRateState } from '../hooks/useWatchHeartRate';
import { watchStateLabel } from '../lib/watchLabels';

interface WatchLinkCardProps {
  watch: WatchHeartRateState;
  theme: ColorPalette;
}

const HELP: Record<string, string> = {
  unsupported:
    'Live watch heart rate works in the Android app. Install the Minimal Fitness APK on your phone to link a Pixel Watch.',
  unavailable:
    'This phone does not have the Google Play services Wearable API, which the watch link needs.',
  'no-watch':
    'Pair your Pixel Watch with this phone in the Pixel Watch app, keep Bluetooth on, then tap Refresh.',
  'no-app':
    'Your watch is connected but Minimal Fitness is not installed on it yet. Install the Minimal Fitness Wear OS APK (see the README), then tap Refresh.',
  waiting:
    'Open Minimal Fitness on your watch and tap Start. Heart rate will appear here within a few seconds.',
  live: 'Streaming live from your watch. Keep Minimal Fitness running on the watch while you train.',
};

export const WatchLinkCard: React.FC<WatchLinkCardProps> = ({ watch, theme }) => {
  const live = watch.state === 'live';
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0"
            style={{ backgroundColor: `${theme.primary}15`, borderColor: `${theme.primary}33` }}
          >
            <Watch className="w-5 h-5" style={{ color: theme.primary }} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Pixel Watch live heart rate</div>
            <div className="text-xs text-[#7E889B] mt-0.5" role="status">
              {watchStateLabel(watch)}
            </div>
          </div>
        </div>
        {watch.supported && (
          <button
            onClick={watch.refresh}
            className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs font-mono text-neutral-300 hover:text-white shrink-0 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        )}
      </div>

      <p className="text-[11px] text-neutral-400 leading-relaxed">{HELP[watch.state]}</p>

      {watch.supported && watch.state !== 'no-watch' && watch.state !== 'unavailable' && (
        <div className="flex gap-2">
          <button
            onClick={watch.start}
            disabled={live}
            className="flex-1 py-2 rounded-lg text-xs font-bold text-black disabled:opacity-40"
            style={{ backgroundColor: theme.primary }}
          >
            Ask watch to start
          </button>
          <button
            onClick={watch.stop}
            className="flex-1 py-2 rounded-lg border border-neutral-700 text-xs font-semibold text-neutral-300 hover:text-white"
          >
            Stop
          </button>
        </div>
      )}

      {watch.error && (
        <p role="alert" className="text-[11px] text-rose-400">
          {watch.error}
        </p>
      )}
    </div>
  );
};
