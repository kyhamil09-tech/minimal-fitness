import React, { useState } from 'react';
import { Activity, BedDouble, Bug, CloudUpload, Footprints, FolderOpen, History, Map as MapIcon, PauseCircle, RefreshCw, Volume2, Watch } from 'lucide-react';
import { RunOptions } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { AutomaticData } from '../hooks/useAutomaticData';
import { AutoBackup } from '../hooks/useAutoBackup';
import { Diagnostics, HealthConnect, isAndroidApp } from '../lib/native';
import { clearErrors, formatErrors, readErrors } from '../lib/diagnostics';
import { downloadTextFile } from '../lib/backup';
import { Row, Toggle } from './ui/SettingsParts';
import { clearTileCache, tileCacheCount } from '../lib/tileCache';
import { setSleepDetectEnabled, sleepDetectEnabled, startSleepDetect, stopSleepDetect } from '../lib/sleepDetect';
import { ownSensorsEnabled, setOwnSensorsEnabled } from '../lib/ownSensors';
import { usePrefs } from '../lib/prefs';

interface AutomationSettingsProps {
  theme: ColorPalette;
  automation: AutomaticData;
  backup: AutoBackup;
  runOptions: RunOptions;
  onRunOptionsChange: (o: RunOptions) => void;
  /** Which part to show: the automatic data sources, run options, folder backup, or diagnostics. */
  part: 'data' | 'run' | 'backup' | 'diagnostics';
  /** Inside a settings group the group already has a title. */
  hideTitles?: boolean;
}

const ago = (ms: number) => {
  if (!ms) return 'never';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};

export const AutomationSettings: React.FC<AutomationSettingsProps> = ({ theme, automation, backup, runOptions, onRunOptionsChange, part, hideTitles = false }) => {
  const android = isAndroidApp();
  const { prefs, setPrefs } = usePrefs();
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [logText, setLogText] = useState<string | null>(null);
  const { steps, hc } = automation;
  const [tiles, setTiles] = useState<number | null>(null);
  const [sleepOn, setSleepOn] = useState<boolean>(sleepDetectEnabled);
  const [ownOn, setOwnOn] = useState<boolean>(ownSensorsEnabled);
  React.useEffect(() => {
    void tileCacheCount().then(setTiles);
  }, []);

  const btn = 'px-3 py-1.5 rounded-lg border border-neutral-700 text-xs font-semibold text-neutral-200 hover:text-white shrink-0';
  const primary = 'px-3 py-1.5 rounded-lg text-xs font-bold text-black shrink-0 disabled:opacity-40';

  const openLog = async () => {
    let native = '';
    if (android) {
      try {
        native = (await Diagnostics.getCrashLog()).log;
      } catch {
        // no native log
      }
    }
    const js = formatErrors(readErrors());
    setLogText([native && `App crashes\n${native}`, js && `Screen errors\n${js}`].filter(Boolean).join('\n\n') || 'Nothing has gone wrong on this device.');
  };

  const clearLog = async () => {
    clearErrors();
    if (android) await Diagnostics.clearCrashLog().catch(() => {});
    setLogText('Nothing has gone wrong on this device.');
  };

  return (
    <>
      {/* AUTOMATIC DATA */}
      {part === 'data' && (
      <div className="space-y-2.5">
        {!hideTitles && (<div className="px-1 text-xs font-semibold uppercase tracking-wider text-[#7E889B] flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" style={{ color: theme.primary }} />
          Automatic data
        </div>)}
        <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] divide-y divide-[#1A1E26] overflow-hidden">
          <Row
            icon={<Footprints className="w-5 h-5 text-sky-300" />}
            title="Steps"
            sub={
              !android
                ? 'Automatic step counting works in the Android app.'
                : steps && !steps.permission
                  ? 'Allow physical-activity access so the phone can count your steps.'
                  : steps && !steps.sensor
                    ? 'This phone has no step counter. Use a watch or Health Connect, or enter steps by hand.'
                    : `Phone ${steps?.phone ?? 0}${steps?.watch ? ` · watch ${steps.watch}` : ''}${hc?.stepsGranted ? ' · Health Connect' : ''} today. The highest source is used.`
            }
            action={
              android && steps && !steps.permission ? (
                <button onClick={automation.enableSteps} className={primary} style={{ backgroundColor: theme.primary }}>
                  Allow
                </button>
              ) : undefined
            }
          />
          <Row
            icon={<BedDouble className="w-5 h-5 text-indigo-300" />}
            title="Detect sleep with this phone"
            sub="Works out when you went to bed and woke up using the phone's own sensors (Google Play services), so you do not need the Google health app. Leave the phone on the bed or nightstand. It gives times only; a watch through Health Connect adds measured sleep stages and replaces these nights."
            action={
              android ? (
                <Toggle
                  on={sleepOn}
                  onChange={(v) => {
                    setSleepOn(v);
                    setSleepDetectEnabled(v);
                    if (v) void startSleepDetect();
                    else void stopSleepDetect();
                  }}
                  label="Detect sleep with this phone"
                />
              ) : undefined
            }
          />
          <Row
            icon={<Watch className="w-5 h-5 text-emerald-300" />}
            title="Own sensors: watch and phone"
            sub={
              !android
                ? 'Works in the Android app.'
                : !ownOn
                  ? 'Off. Turn on to let the app use heart rate, steps and sleep readings your watch and phone collect themselves.'
                  : !automation.watchData || !automation.watchData.watchSyncAt
                    ? 'Waiting for your watch. Open Minimal Fitness on the watch once, allow the all-day heart rate permission it asks for, and wear it. Nothing has arrived yet.'
                    : `Watch last delivered ${ago(automation.watchData.watchSyncAt)} · ${automation.watchData.hrToday} heart-rate readings today. These feed the Fitness numbers, and sleep stages are estimated from them when Health Connect has none.`
            }
            action={
              android ? (
                <Toggle
                  on={ownOn}
                  onChange={(v) => {
                    setOwnOn(v);
                    setOwnSensorsEnabled(v);
                    if (v) void automation.syncNow();
                  }}
                  label="Use my own watch and phone sensors"
                />
              ) : undefined
            }
          />
          <Row
            icon={<BedDouble className="w-5 h-5 text-violet-300" />}
            title="Health Connect (read and write)"
            sub={
              !android
                ? 'Available in the Android app.'
                : hc?.needsUpdate
                  ? 'Update Health Connect from Google Play to use it.'
                  : hc && !hc.available
                    ? 'Health Connect is not installed on this phone.'
                    : hc?.allGranted
                      ? `All ${hc.total} permissions the app asks for are granted. Sleep, steps and heart rate come in; your workouts, meals, water, weight and sleep go out. Last sync ${ago(automation.hcLastSyncAt)}${automation.hcNightsImported ? ` · ${automation.hcNightsImported} nights found` : ''}.`
                      : hc && (hc.grantedCount ?? 0) > 0
                        ? `${hc.grantedCount} of ${hc.total} permissions granted${hc.canWrite ? '' : ' (writing is off)'}. Grant the rest so everything can sync.`
                        : 'Read your watch’s sleep, steps and heart rate from Health Connect and save your workouts, meals, water, weight and sleep back to it. Stays on this phone.'
            }
            action={
              android && hc?.available ? (
                <div className="flex flex-col gap-1.5 items-end">
                  {!hc.allGranted && (
                    <button onClick={automation.connectHealthConnect} className={primary} style={{ backgroundColor: theme.primary }}>
                      Grant all
                    </button>
                  )}
                  {(hc.grantedCount ?? 0) > 0 && (
                    <button onClick={automation.syncNow} className={btn} aria-label="Sync now">
                      <RefreshCw className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                      Sync
                    </button>
                  )}
                </div>
              ) : undefined
            }
          />
          {android && hc?.available && (
            <Row
              icon={<Activity className="w-5 h-5 text-emerald-300" />}
              title="Bring in workouts from Google Health"
              sub="Workouts the Google Health (Fitbit) app and other apps saved to Health Connect appear in your list with their time, distance, calories and heart rate. Their GPS route is not shared with other apps by Android. Each is added once; one you delete stays deleted."
              action={<Toggle on={prefs.importHcWorkouts} onChange={(v) => setPrefs({ importHcWorkouts: v })} label="Bring in workouts from Health Connect" />}
            />
          )}
          {android && hc?.available && !hc.allGranted && (hc.grantedCount ?? 0) > 0 && (
            <Row
              icon={<RefreshCw className="w-5 h-5 text-neutral-300" />}
              title="Still missing some permissions?"
              sub="Android stops showing the pop-up after a few refusals. Open Health Connect and switch on everything for Minimal Fitness."
              action={
                <button onClick={() => HealthConnect.openSettings().catch(() => {})} className={btn}>
                  Open
                </button>
              }
            />
          )}          {automation.hcError && (
            <p role="alert" className="px-4 py-2 text-[11px] text-rose-400">
              {automation.hcError}
            </p>
          )}
        </div>
      </div>
      )}

      {/* RUN OPTIONS */}
      {part === 'run' && (
      <div className="space-y-2.5">
        {!hideTitles && (<div className="px-1 text-xs font-semibold uppercase tracking-wider text-[#7E889B] flex items-center gap-1.5">
          <MapIcon className="w-3.5 h-3.5" style={{ color: theme.primary }} />
          Run options
        </div>)}
        <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] divide-y divide-[#1A1E26] overflow-hidden">
          <Row
            icon={<PauseCircle className="w-5 h-5 text-amber-300" />}
            title="Auto-pause"
            sub="Pauses the clock and distance when you stop at a light, and resumes when you move. Works while the screen is on."
            action={<Toggle on={runOptions.autoPause} onChange={(v) => onRunOptionsChange({ ...runOptions, autoPause: v })} label="Auto-pause" />}
          />
          <Row
            icon={<Volume2 className="w-5 h-5 text-sky-300" />}
            title="Spoken updates"
            sub="Every kilometre or mile: lap time and pace, and a lap-button announcement. Keeps working with the screen off (Android app)."
            action={<Toggle on={runOptions.voiceCues} onChange={(v) => onRunOptionsChange({ ...runOptions, voiceCues: v })} label="Spoken updates" />}
          />
          {runOptions.voiceCues && (
            <Row
              icon={<Activity className="w-5 h-5 text-rose-300" />}
              title="Include heart rate"
              sub="Adds your current heart rate to each spoken update when a watch or strap is connected."
              action={<Toggle on={runOptions.voiceHeartRate} onChange={(v) => onRunOptionsChange({ ...runOptions, voiceHeartRate: v })} label="Include heart rate" />}
            />
          )}
          <Row
            icon={<MapIcon className="w-5 h-5 text-emerald-300" />}
            title="Live map"
            sub="Shows your route on a map while a GPS workout runs (needs internet for the street map)."
            action={<Toggle on={runOptions.liveMap} onChange={(v) => onRunOptionsChange({ ...runOptions, liveMap: v })} label="Live map" />}
          />
          <Row
            icon={<MapIcon className="w-5 h-5 text-sky-300" />}
            title="Offline maps"
            sub={`Maps you view are kept on this phone, so places you run often still draw without a signal. ${tiles === null ? '' : `${tiles.toLocaleString()} map tiles saved.`}`}
            action={
              tiles ? (
                <button
                  onClick={async () => {
                    await clearTileCache();
                    setTiles(0);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs font-semibold text-neutral-200 hover:text-white shrink-0"
                >
                  Clear
                </button>
              ) : undefined
            }
          />
        </div>
      </div>
      )}

      {/* BACKUP */}
      {part === 'backup' && (
      <div className="space-y-2.5">
        {!hideTitles && (<div className="px-1 text-xs font-semibold uppercase tracking-wider text-[#7E889B] flex items-center gap-1.5">
          <CloudUpload className="w-3.5 h-3.5" style={{ color: theme.primary }} />
          Automatic backup
        </div>)}
        <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] divide-y divide-[#1A1E26] overflow-hidden">
          <Row
            icon={<FolderOpen className="w-5 h-5 text-emerald-300" />}
            title={backup.status?.folder ? `Backing up to “${backup.status.folder}”` : 'Back up to a folder'}
            sub={
              !android
                ? 'Automatic backup works in the Android app. Use Backup, Restore & Export above.'
                : backup.status?.folder
                  ? `Once a day and after each new workout. The last 7 backups are kept. Last backup ${ago(backup.status.lastBackupAt)}.`
                  : backup.status?.needsReselect
                    ? 'Access to the folder was lost. Choose it again.'
                    : 'Pick a folder once, ideally one in Google Drive, so your data survives losing or reinstalling the app.'
            }
            action={
              android ? (
                backup.status?.folder ? (
                  <button onClick={backup.backupNow} disabled={backup.working} className={btn}>
                    {backup.working ? 'Saving…' : 'Back up now'}
                  </button>
                ) : (
                  <button onClick={backup.chooseFolder} className={primary} style={{ backgroundColor: theme.primary }}>
                    Choose folder
                  </button>
                )
              ) : undefined
            }
          />
          {android && backup.status?.folder && (
            <div className="px-4 py-3 flex flex-wrap items-center gap-2">
              <button onClick={backup.chooseFolder} className={btn}>
                Change folder
              </button>
              {!confirmRestore ? (
                <button onClick={() => setConfirmRestore(true)} className={btn}>
                  <History className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                  Restore latest
                </button>
              ) : (
                <span className="flex items-center gap-2 text-[11px]">
                  <span className="text-amber-200">Replace everything with the newest backup?</span>
                  <button onClick={backup.restoreLatest} className="text-rose-400 font-bold">
                    Yes
                  </button>
                  <button onClick={() => setConfirmRestore(false)} className="text-neutral-400">
                    No
                  </button>
                </span>
              )}
              <button onClick={backup.stop} className="text-[11px] text-neutral-500 hover:text-rose-400 ml-auto">
                Turn off
              </button>
            </div>
          )}
          {backup.error && (
            <p role="alert" className="px-4 py-2 text-[11px] text-rose-400">
              {backup.error}
            </p>
          )}
        </div>
      </div>
      )}

      {/* DIAGNOSTICS */}
      {part === 'diagnostics' && (
      <div className="space-y-2.5">
        {!hideTitles && (<div className="px-1 text-xs font-semibold uppercase tracking-wider text-[#7E889B] flex items-center gap-1.5">
          <Bug className="w-3.5 h-3.5" style={{ color: theme.primary }} />
          Diagnostics
        </div>)}
        <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] overflow-hidden">
          <Row
            icon={<Bug className="w-5 h-5 text-neutral-300" />}
            title="Error log"
            sub="Crashes and errors are kept only on this device and never sent anywhere. Share the log if something misbehaves."
            action={
              <button onClick={logText === null ? openLog : () => setLogText(null)} className={btn}>
                {logText === null ? 'View' : 'Hide'}
              </button>
            }
          />
          {logText !== null && (
            <div className="px-4 pb-4 space-y-2">
              <pre className="max-h-56 overflow-auto text-[10px] leading-snug text-neutral-300 bg-black/50 border border-white/10 rounded-xl p-3 whitespace-pre-wrap break-words">
                {logText}
              </pre>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadTextFile(`ky-fitness-log-${new Date().toISOString().slice(0, 10)}.txt`, logText, 'text/plain')}
                  className={btn}
                >
                  Share log
                </button>
                <button onClick={clearLog} className={btn}>
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

    </>
  );
};
