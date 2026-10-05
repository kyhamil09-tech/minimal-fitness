import React from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { TabId } from '../types/health';
import { ColorPalette } from '../types/theme';
import { WatchHeartRateState } from '../hooks/useWatchHeartRate';
import { watchStateLabel } from '../lib/watchLabels';

interface AmoledTopBarProps {
  watch: WatchHeartRateState;
  theme: ColorPalette;
  currentTab: TabId;
  onNavigateToSettings: () => void;
  onClose?: () => void;
}

export const AmoledTopBar: React.FC<AmoledTopBarProps> = ({
  watch,
  theme,
  currentTab,
  onNavigateToSettings,
  onClose,
}) => {
  const isSettingsActive = currentTab === 'settings';
  const isLive = watch.state === 'live';

  return (
    <header className="sticky top-0 z-40 w-full bg-black/95 backdrop-blur-md border-b border-[#1A1E26] px-4 py-2.5 flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-wider text-white">MINIMAL FITNESS</span>
          <span
            title="Your data stays on this device"
            className="text-[11px] px-1.5 py-0.5 rounded font-mono flex items-center gap-1"
            style={{
              color: theme.primary,
              backgroundColor: `${theme.primary}18`,
              borderColor: `${theme.primary}33`,
              borderWidth: '1px',
            }}
          >
            <ShieldCheck className="w-3 h-3" style={{ color: theme.primary }} />
            LOCAL-ONLY
          </span>
        </div>
        {watch.supported && (
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-[#7E889B]">
            <span
              className={`w-2 h-2 rounded-full ${isLive ? '' : 'bg-neutral-600'}`}
              style={{
                backgroundColor: isLive ? theme.primary : undefined,
                boxShadow: isLive ? `0 0 8px ${theme.primary}` : undefined,
              }}
            />
            <span className="font-mono text-[11px]">{watchStateLabel(watch)}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onNavigateToSettings}
          className={`min-h-[42px] px-3.5 flex items-center gap-2.5 rounded-xl border transition-all ${
            isSettingsActive ? 'bg-[#12151C] shadow-lg' : 'bg-[#0B0D11] hover:bg-[#151820]'
          }`}
          style={{
            borderColor: isSettingsActive ? theme.primary : '#1A1E26',
            boxShadow: isSettingsActive ? `0 0 14px ${theme.primary}22` : undefined,
          }}
          title="Open Settings"
          aria-label="Open Settings Tab"
        >
          <div className="flex flex-col justify-center items-center gap-1 w-4 h-4">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-4 h-[2px] rounded-full transition-colors"
                style={{ backgroundColor: isSettingsActive ? theme.primary : '#E5E7EB' }}
              />
            ))}
          </div>
          <span
            className="text-xs font-semibold tracking-wide transition-colors"
            style={{ color: isSettingsActive ? theme.primary : '#FFFFFF' }}
          >
            Settings
          </span>
        </button>

        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-xl border border-[#1A1E26] bg-[#0B0D11] hover:bg-[#151820] text-neutral-400 hover:text-white transition-colors"
            title="Hide top bar"
            aria-label="Hide top bar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
