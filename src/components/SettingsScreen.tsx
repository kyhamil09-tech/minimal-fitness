import React from 'react';
import {
  SlidersHorizontal,
  ShieldCheck,
  Palette,
  Trash2,
  ChevronRight,
  Eye,
  EyeOff,
  UserRound,
  Bell,
  DatabaseBackup,
  Bluetooth,
  Watch,
  Navigation,
  Link2,
  FileUp,
  MessageSquare,
} from 'lucide-react';
import { LiveSharePanel } from './LiveSharePanel';
import { LogoSettings } from './LogoSettings';
import { ColorPalette } from '../types/theme';
import { BleHeartRate } from '../hooks/useBleHeartRate';
import { WatchHeartRateState } from '../hooks/useWatchHeartRate';
import { WatchLinkCard } from './WatchLinkCard';
import { AutomationSettings } from './AutomationSettings';
import { StravaSettings } from './StravaSettings';
import { PrivacyPanel } from './PrivacyPanel';
import { LookPrefs, RunPrefs } from './PrefsSettings';
import { SettingsGroup } from './ui/SettingsParts';
import { AutomaticData } from '../hooks/useAutomaticData';
import { AutoBackup } from '../hooks/useAutoBackup';
import { RunOptions, UnitSystem } from '../types/tracking';
import { WorkoutSession } from '../types/health';
import { distanceUnit, kmToDisplay } from '../lib/units';

interface SettingsScreenProps {
  ble: BleHeartRate;
  watch: WatchHeartRateState;
  automation: AutomaticData;
  backup: AutoBackup;
  runOptions: RunOptions;
  onRunOptionsChange: (o: RunOptions) => void;
  themeMode: 'dark' | 'light' | 'auto';
  onThemeModeChange: (m: 'dark' | 'light' | 'auto') => void;
  profileName: string;
  onOpenProfile: () => void;
  onOpenReminders: () => void;
  onOpenBackup: () => void;
  onOpenImport: () => void;
  theme: ColorPalette;
  isTopBannerVisible?: boolean;
  onToggleTopBanner?: () => void;
  onOpenTabEditor: () => void;
  onOpenThemeModal: () => void;
  /** e.g. "Warm cream background". */
  lookSummary?: string;
  onResetAllData: () => void;
  workouts?: WorkoutSession[];
  units?: UnitSystem;
  /** Offers the menstrual cycle tracking switch (the profile is female). */
  showCycle?: boolean;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  ble,
  watch,
  automation,
  backup,
  runOptions,
  onRunOptionsChange,
  themeMode,
  onThemeModeChange,
  profileName,
  onOpenProfile,
  onOpenReminders,
  onOpenBackup,
  onOpenImport,
  theme,
  isTopBannerVisible = false,
  onToggleTopBanner,
  onOpenTabEditor,
  onOpenThemeModal,
  lookSummary,
  onResetAllData,
  workouts = [],
  units = 'metric',
  showCycle = false,
}) => {
  const [confirmReset, setConfirmReset] = React.useState(false);

  return (
    <div className="space-y-5 pb-8 animate-fadeIn">
      {/* Profile header with lifetime totals */}
      <section className="rounded-[28px] border p-5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-extrabold text-black shrink-0"
            style={{ backgroundColor: theme.primary }}
          >
            {(profileName || 'You').trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate">{profileName || 'Athlete'}</h1>
            <button onClick={onOpenProfile} className="mt-1 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: theme.primary }}>
              Edit profile and goals
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-5">
          <div>
            <div className="hero-num text-[2.2rem]">{workouts.length}</div>
            <div className="stat-label mt-1">Activities</div>
          </div>
          <div>
            <div className="hero-num text-[2.2rem]">{kmToDisplay(workouts.reduce((s, w) => s + (w.distanceKm || 0), 0), units, 0)}</div>
            <div className="stat-label mt-1">Total {distanceUnit(units)}</div>
          </div>
          <div>
            <div className="hero-num text-[2.2rem]">{Math.round(workouts.reduce((s, w) => s + w.durationMinutes, 0) / 60)}</div>
            <div className="stat-label mt-1">Hours</div>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between border-b border-[#1A1E26] pb-3">
        <div>
          <h2 className="gh-title">Settings</h2>
          <p className="text-xs text-[#7E889B] mt-1">Profile, sensors, data and appearance</p>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('kyfit-open-settings-group', { detail: 'privacy' }))}
          aria-label="Open Privacy and data: see proof that everything stays on this device"
          className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium flex items-center gap-1.5 border"
          style={{
            color: theme.primary,
            backgroundColor: `${theme.primary}12`,
            borderColor: `${theme.primary}33`,
          }}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>On-device</span>
        </button>
      </div>

      {/* PROFILE AND GOALS */}
      <SettingsGroup id="profile" title="Profile & goals" summary="Your details, targets and reminders" icon={<UserRound className="w-5 h-5" style={{ color: theme.primary }} />} defaultOpen>
      {/* PROFILE & DATA */}
      <div className="space-y-2.5">
                <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] divide-y divide-[#1A1E26] overflow-hidden">
          <button onClick={onOpenProfile} className="w-full p-4 flex items-center justify-between text-left hover:bg-neutral-900/60 transition-colors group">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center border" style={{ backgroundColor: `${theme.primary}15`, borderColor: `${theme.primary}33` }}>
                <UserRound className="w-5 h-5" style={{ color: theme.primary }} />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Profile & Goals</div>
                <div className="text-xs text-[#7E889B] mt-0.5">
                  {profileName ? `${profileName} · ` : ''}Units, heart-rate zones, calorie, step & water targets
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
          </button>

          <button onClick={onOpenReminders} className="w-full p-4 flex items-center justify-between text-left hover:bg-neutral-900/60 transition-colors group">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                <Bell className="w-5 h-5 text-neutral-300" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Reminders</div>
                <div className="text-xs text-[#7E889B] mt-0.5">Workout, bedtime, hydration and fasting notifications</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
          </button>

        </div>
      </div>


      </SettingsGroup>

      {/* PRIVACY */}
      <SettingsGroup id="privacy" title="Privacy & data" summary="Proof that everything stays on this phone" icon={<ShieldCheck className="w-5 h-5" style={{ color: theme.primary }} />}>
        <PrivacyPanel theme={theme} />
      </SettingsGroup>

      {/* RUN */}
      <SettingsGroup id="run" title="Run" summary="Auto-pause, spoken updates, countdown, GPS, buzz and beat" icon={<Navigation className="w-5 h-5" style={{ color: theme.primary }} />}>
        <AutomationSettings part="run" hideTitles theme={theme} automation={automation} backup={backup} runOptions={runOptions} onRunOptionsChange={onRunOptionsChange} />
        <RunPrefs theme={theme} units={units} voiceCues={runOptions.voiceCues} />
      </SettingsGroup>

      {/* SAFETY */}
      <SettingsGroup id="safety" title="Safety live share" summary="Text a map link to people you choose while you run or ride" icon={<MessageSquare className="w-5 h-5" style={{ color: theme.primary }} />}>
        <LiveSharePanel theme={theme} />
      </SettingsGroup>

      {/* HEALTH DATA */}
      <SettingsGroup id="health" title="Health data" summary="Watch, heart-rate sensors, steps, sleep and Health Connect" icon={<Watch className="w-5 h-5" style={{ color: theme.primary }} />}>
      {/* SENSORS */}
      <div className="space-y-2.5">
                <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] divide-y divide-[#1A1E26] overflow-hidden">
          <WatchLinkCard watch={watch} theme={theme} />

          {/* Web Bluetooth only exists in desktop/Android Chrome, not inside the Android app's WebView. */}
          {ble.supported && (
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
                    <Bluetooth className="w-5 h-5 text-sky-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Bluetooth Heart-Rate Sensor</div>
                    <div className="text-xs text-[#7E889B] mt-0.5" role="status">
                      {ble.status === 'connected'
                        ? `Live from ${ble.deviceName}${ble.bpm ? ` · ${ble.bpm} bpm` : ' · waiting for a reading…'}`
                        : ble.status === 'connecting'
                          ? 'Connecting…'
                          : ble.status === 'scanning'
                            ? 'Searching for sensors… wear the strap or switch the device on'
                            : 'Chest strap or other device broadcasting standard heart rate'}
                    </div>
                  </div>
                </div>
                {ble.status === 'connected' ? (
                  <button onClick={ble.disconnect} className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs font-mono text-neutral-300 hover:text-white shrink-0">
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={ble.connect}
                    disabled={ble.status === 'connecting' || ble.status === 'scanning'}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-black disabled:opacity-40 shrink-0"
                    style={{ backgroundColor: theme.primary }}
                  >
                    {ble.native ? (ble.status === 'scanning' ? 'Scanning…' : 'Scan') : 'Connect'}
                  </button>
                )}
              </div>

              {ble.native && ble.status === 'scanning' && ble.devices.length === 0 && (
                <p className="text-[11px] text-neutral-500">No sensors found yet.</p>
              )}
              {ble.native && ble.devices.length > 0 && ble.status !== 'connected' && (
                <div className="space-y-1.5">
                  {ble.devices.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => ble.connectTo(d.id)}
                      disabled={ble.status === 'connecting'}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-700 text-left text-xs text-white hover:border-neutral-500 disabled:opacity-40 flex items-center justify-between"
                    >
                      <span>{d.name}</span>
                      <span className="font-mono text-neutral-500">Connect</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-neutral-600 leading-relaxed">
                Pixel Watch and other Wear OS watches don't broadcast heart rate over Bluetooth. Use the Pixel Watch
                live heart rate above for those.
              </p>
              {ble.error && (
                <p role="alert" className="text-[11px] text-rose-400">
                  {ble.error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>


        <AutomationSettings part="data" hideTitles theme={theme} automation={automation} backup={backup} runOptions={runOptions} onRunOptionsChange={onRunOptionsChange} />
      </SettingsGroup>

      {/* CONNECTIONS */}
      <SettingsGroup id="connections" title="Connections" summary="Strava" icon={<Link2 className="w-5 h-5" style={{ color: theme.primary }} />}>
        <StravaSettings theme={theme} hideTitle />
      </SettingsGroup>

      {/* LOOK AND FEEL */}
      <SettingsGroup id="look" title="Look & feel" summary="Theme, text size, swipe, week start and motion" icon={<Palette className="w-5 h-5" style={{ color: theme.primary }} />}>
      {/* DISPLAY */}
      <div className="space-y-2.5">
        
        <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] divide-y divide-[#1A1E26] overflow-hidden">
          <button
            onClick={onOpenThemeModal}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-neutral-900/60 transition-colors group"
          >
            <div className="flex items-center gap-3.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm"
                style={{ backgroundColor: `${theme.primary}20`, borderColor: theme.primary }}
              >
                <div className="w-4 h-4 rounded-full border border-black/80" style={{ backgroundColor: theme.primary }} />
              </div>
              <div>
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  Colours & background
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono uppercase" style={{ color: theme.primary, backgroundColor: `${theme.primary}18` }}>
                    {theme.name}
                  </span>
                </div>
                <div className="text-xs text-[#7E889B] mt-0.5">{lookSummary || 'Soft backgrounds, pastels, AMOLED and your own colours'}</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
          </button>

          <div className="p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Appearance</div>
              <div className="text-xs text-[#7E889B] mt-0.5">Dark, light, or follow your phone</div>
            </div>
            <div role="radiogroup" aria-label="Appearance" className="flex rounded-full glass-chip p-0.5 text-[11px] font-semibold shrink-0">
              {(['dark', 'light', 'auto'] as const).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={themeMode === m}
                  onClick={() => onThemeModeChange(m)}
                  className={'px-3 py-1.5 rounded-full capitalize ' + (themeMode === m ? 'bg-white/25 text-white' : 'text-neutral-300')}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={onOpenTabEditor}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-neutral-900/60 transition-colors group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                <SlidersHorizontal className="w-5 h-5 text-neutral-300" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Customize Visible Metrics</div>
                <div className="text-xs text-[#7E889B] mt-0.5">Choose which cards show on Today</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
          </button>

          {onToggleTopBanner && (
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                  {isTopBannerVisible ? <Eye className="w-5 h-5 text-emerald-400" /> : <EyeOff className="w-5 h-5 text-neutral-400" />}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Top App Bar</div>
                  <div className="text-xs text-[#7E889B] mt-0.5">
                    {isTopBannerVisible ? 'Shown above each screen, with watch status' : 'Hidden for more room'}
                  </div>
                </div>
              </div>
              <button
                onClick={onToggleTopBanner}
                className="px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors"
                style={{
                  borderColor: isTopBannerVisible ? `${theme.primary}55` : '#1A1E26',
                  color: isTopBannerVisible ? theme.primary : '#CBD5E1',
                  backgroundColor: isTopBannerVisible ? `${theme.primary}15` : '#000000',
                }}
              >
                {isTopBannerVisible ? 'Hide' : 'Show'}
              </button>
            </div>
          )}
        </div>
      </div>


        <LogoSettings />
        <LookPrefs showCycle={showCycle} />
      </SettingsGroup>

      {/* DATA */}
      <SettingsGroup id="data" title="Data & backup" summary="Backup, restore, export and the error log" icon={<DatabaseBackup className="w-5 h-5" style={{ color: theme.primary }} />}>
        <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] overflow-hidden">
          <button onClick={onOpenBackup} className="w-full p-4 flex items-center justify-between text-left hover:bg-neutral-900/60 transition-colors group">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                <DatabaseBackup className="w-5 h-5 text-neutral-300" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Backup, Restore & Export</div>
                <div className="text-xs text-[#7E889B] mt-0.5">Download your data as JSON/CSV or restore a backup</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
          </button>
        </div>
        <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] overflow-hidden">
          <button onClick={onOpenImport} className="w-full p-4 flex items-center justify-between text-left hover:bg-neutral-900/60 transition-colors group">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                <FileUp className="w-5 h-5 text-neutral-300" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Import your history</div>
                <div className="text-xs text-[#7E889B] mt-0.5">From Strava, Google Takeout, Nike, Garmin and other apps</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
          </button>
        </div>
        <AutomationSettings part="backup" hideTitles theme={theme} automation={automation} backup={backup} runOptions={runOptions} onRunOptionsChange={onRunOptionsChange} />
        <AutomationSettings part="diagnostics" hideTitles theme={theme} automation={automation} backup={backup} runOptions={runOptions} onRunOptionsChange={onRunOptionsChange} />
      </SettingsGroup>

      {/* ERASE */}
      <div className="pt-2 space-y-2">
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="w-full p-3.5 rounded-xl border border-red-500/20 bg-red-950/10 text-red-400 hover:bg-red-950/20 hover:border-red-500/40 transition-colors flex items-center justify-center gap-2 text-xs font-medium"
          >
            <Trash2 className="w-4 h-4" />
            <span>Erase all my data and start over</span>
          </button>
        ) : (
          <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-3 space-y-2">
            <p className="text-xs text-red-200">
              This permanently deletes your profile, workouts, logs and settings from this device. Export a backup first if
              you might want them back.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmReset(false)} className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs text-neutral-300">
                Cancel
              </button>
              <button onClick={onResetAllData} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold">
                Yes, erase everything
              </button>
            </div>
          </div>
        )}
        <p className="text-[11px] text-center text-neutral-500">
          Minimal Fitness · Everything you log stays on this device.
        </p>
      </div>
    </div>
  );
};
