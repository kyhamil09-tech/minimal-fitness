import React, { useState } from 'react';
import { Activity, BedDouble, Bug, CloudUpload, FolderOpen, HeartHandshake, History, Map as MapIcon, PauseCircle, RefreshCw, UploadCloud, Volume2, Watch } from 'lucide-react';
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
import { autoEncryptionOn, enableAutoEncryption } from '../lib/cryptoBackup';
import { usePrefs } from '../lib/prefs';
import { StepsSettings } from './StepsSettings';
import { HealthShareChecklist } from './HealthShareChecklist';

interface AutomationSettingsProps {
  theme: ColorPalette;
  automation: AutomaticData;
  backup: AutoBackup;
  runOptions: RunOptions;
  onRunOptionsChange: (o: RunOptions) => void;
  /** Which part to show: the automatic data sources, run options, folder backup, or diagnostics. */
  part: 'data' | 'run' | 'backup' | 'diagnostics';
  /** Workouts never saved to Health Connect, and a way to send them now (resolves with how many went). */
  hcWaiting?: number;
  onSendUnsynced?: () => Promise<number>;
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

/** The kinds of Health Connect data the app can use, each asked for on its own so you only share what you want. */
const HC_GROUPS: { id: string; label: string; sub: string }[] = [
  { id: 'activity', label: 'Workouts and steps', sub: 'Steps, distance, calories and workouts, in and out' },
  { id: 'heart', label: 'Heart rate', sub: 'Heart rate, resting rate and VO2 max' },
  { id: 'sleep', label: 'Sleep and recovery', sub: 'Sleep stages, HRV, breathing and oxygen' },
  { id: 'body', label: 'Body', sub: 'Weight, body fat and height' },
  { id: 'nutrition', label: 'Food and water', sub: 'Meals and drinks you log, saved to Health Connect' },
  { id: 'vitals', label: 'Blood pressure and glucose', sub: 'Readings you log, saved to Health Connect' },
];

export const AutomationSettings: React.FC<AutomationSettingsProps> = ({ theme, automation, backup, runOptions, onRunOptionsChange, part, hideTitles = false, hcWaiting = 0, onSendUnsynced }) => {
  const android = isAndroidApp();
  const { prefs, setPrefs } = usePrefs();
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [logText, setLogText] = useState<string | null>(null);
  const { hc } = automation;
  // Receiving is the default. What counts as "all granted" depends on whether saving to Health Connect is also on.
  const hcWrite = prefs.writeHealthConnect;
  const hcAll = !!hc && (hcWrite ? !!hc.allGranted : !!hc.allReadGranted);
  const hcHave = hc ? (hcWrite ? (hc.grantedCount ?? 0) : (hc.readGrantedCount ?? 0)) : 0;
  const hcTotal = hc ? (hcWrite ? (hc.total ?? 0) : (hc.readTotal ?? 0)) : 0;
  const [tiles, setTiles] = useState<number | null>(null);
  const [sleepOn, setSleepOn] = useState<boolean>(sleepDetectEnabled);
  const [ownOn, setOwnOn] = useState<boolean>(ownSensorsEnabled);
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNote] = useState('');
  const [drivePass, setDrivePass] = useState('');
  const [driveEnc, setDriveEnc] = useState<boolean>(() => autoEncryptionOn());
  const [confirmDriveRestore, setConfirmDriveRestore] = useState(false);
  React.useEffect(() => {
    void tileCacheCount().then(setTiles);
  }, []);

  const btn = 'min-h-11 px-4 rounded-xl border border-neutral-700 text-xs font-semibold text-neutral-200 hover:text-white shrink-0';
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
        {!hideTitles && (<div className="px-1 text-sm font-bold text-neutral-200 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" style={{ color: theme.primary }} />
          Automatic data
        </div>)}
        <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] divide-y divide-[#1A1E26] overflow-hidden">
          <StepsSettings theme={theme} automation={automation} android={android} />
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
            icon={<HeartHandshake className="w-5 h-5 text-violet-300" />}
            title="Use Health Connect"
            sub={
              prefs.useHealthConnect
                ? prefs.writeHealthConnect
                  ? 'On. Other apps’ data comes in, and what you log is saved back to Health Connect.'
                  : 'On, receive only. Your watch’s sleep stages, HRV and other trackers’ data (a band, a ring, a Fitbit) come in. Nothing you log is sent out.'
                : 'Off. The app does not read from or write to Health Connect and never asks for its permissions. Steps, heart rate and sleep still come from your watch and phone. Data already imported stays.'
            }
            action={
              <Toggle
                on={prefs.useHealthConnect}
                onChange={(v) => {
                  setPrefs({ useHealthConnect: v });
                  setSendNote('');
                }}
                label="Use Health Connect"
              />
            }
          />
          {prefs.useHealthConnect && (<>
          <Row
            icon={<UploadCloud className="w-5 h-5 text-sky-300" />}
            title="Send my data to Health Connect"
            sub={
              prefs.writeHealthConnect
                ? 'On. Only the kinds of data you tick below are saved to Health Connect, where other apps you allow can read them.'
                : 'Off. The app only receives. Nothing you log or record here is saved to Health Connect.'
            }
            action={<Toggle on={prefs.writeHealthConnect} onChange={(v) => setPrefs({ writeHealthConnect: v })} label="Send my data to Health Connect" />}
          />
          {prefs.writeHealthConnect && (
            <HealthShareChecklist
              share={prefs.hcShare}
              onChange={(hcShare) => setPrefs({ hcShare })}
              hc={hc}
              askFor={(g) => automation.connectHealthConnect(g)}
              accent={theme.primary}
            />
          )}
          <Row
            icon={<BedDouble className="w-5 h-5 text-violet-300" />}
            title={prefs.writeHealthConnect ? 'Health Connect (read and write)' : 'Health Connect (receive only)'}
            sub={
              !android
                ? 'Available in the Android app.'
                : hc?.needsUpdate
                  ? 'Update Health Connect from Google Play to use it.'
                  : hc && !hc.available
                    ? 'Health Connect is not installed on this phone.'
                    : hcAll
                      ? `All ${hcTotal} permissions the app asks for are granted. Sleep, steps and heart rate come in${hcWrite ? '; your workouts, meals, water, weight and sleep go out' : '; nothing goes out'}. Last sync ${ago(automation.hcLastSyncAt)}${automation.hcNightsImported ? ` · ${automation.hcNightsImported} nights found` : ''}.`
                      : hc && hcHave > 0
                        ? `${hcHave} of ${hcTotal} permissions granted. Grant the rest so everything can come in.`
                        : hcWrite
                          ? 'Read your watch’s sleep, steps and heart rate from Health Connect and save your workouts, meals, water, weight and sleep back to it. Stays on this phone.'
                          : 'Read your watch’s sleep, steps and heart rate, and other trackers’ data, from Health Connect. The app asks only to read, and sends nothing back. Stays on this phone.'
            }
            action={
              android && hc?.available ? (
                <div className="flex flex-col gap-1.5 items-end">
                  {!hcAll && (
                    <button onClick={() => automation.connectHealthConnect()} className={primary} style={{ backgroundColor: theme.primary }}>
                      Grant all
                    </button>
                  )}
                  {hcHave > 0 && (
                    <button onClick={automation.syncNow} className={btn} aria-label="Sync now">
                      <RefreshCw className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                      Sync
                    </button>
                  )}
                </div>
              ) : undefined
            }
          />
          {android && hc?.available && hc.groups && !hcAll && (
            <div className="px-4 pb-3 space-y-2" role="group" aria-label="Health Connect access by feature">
              <div className="text-sm font-bold text-neutral-200">Choose what to share</div>
              {HC_GROUPS.map((g) => {
                const st = hc.groups?.[g.id];
                if (!st) return null;
                const total = hcWrite ? st.total : (st.readTotal ?? st.total);
                const got = hcWrite ? st.granted : (st.readGranted ?? st.granted);
                if (total === 0) return null; // nothing in this group to read
                const done = got >= total;
                return (
                  <div key={g.id} className="flex min-h-11 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{g.label}</div>
                      <div className="text-xs text-neutral-400">{g.sub}</div>
                    </div>
                    {done ? (
                      <span className="text-xs font-bold text-emerald-300">On</span>
                    ) : (
                      <button onClick={() => automation.connectHealthConnect([g.id])} className={btn}>
                        {got > 0 ? 'Finish' : 'Allow'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {android && hc?.available && (
            <Row
              icon={<Activity className="w-5 h-5 text-emerald-300" />}
              title="Bring in workouts from Google Health"
              sub="Workouts the Google Health (Fitbit) app and other apps saved to Health Connect appear in your list with their time, distance, calories and heart rate. Their GPS route is not shared with other apps by Android. Each is added once; one you delete stays deleted."
              action={<Toggle on={prefs.importHcWorkouts} onChange={(v) => setPrefs({ importHcWorkouts: v })} label="Bring in workouts from Health Connect" />}
            />
          )}
          {android && hc?.available && !hcAll && hcHave > 0 && (
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
          )}
          {android && hc?.available && hcWrite && hc.canWrite && hcWaiting > 0 && onSendUnsynced && (
            <Row
              icon={<UploadCloud className="w-5 h-5 text-emerald-300" />}
              title={`${hcWaiting} workout${hcWaiting === 1 ? '' : 's'} not saved to Health Connect`}
              sub={sendNote || 'From the last 90 days: recorded while Health Connect was off or before it was set up. Imported workouts are not included.'}
              action={
                <button
                  disabled={sending}
                  onClick={async () => {
                    setSending(true);
                    const n = await onSendUnsynced();
                    setSending(false);
                    setSendNote(n > 0 ? `Saved ${n} to Health Connect.` : 'Nothing could be saved. Check the permissions above.');
                  }}
                  className={primary}
                  style={{ backgroundColor: theme.primary }}
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              }
            />
          )}
          {automation.hcError && (
            <p role="alert" className="px-4 py-2 text-xs text-rose-400">
              {automation.hcError}
            </p>
          )}
          </>)}
        </div>
      </div>
      )}

      {/* RUN OPTIONS */}
      {part === 'run' && (
      <div className="space-y-2.5">
        {!hideTitles && (<div className="px-1 text-sm font-bold text-neutral-200 flex items-center gap-1.5">
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
            sub="Every kilometer or mile: lap time and pace, and a lap-button announcement. Keeps working with the screen off (Android app)."
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
        {!hideTitles && (<div className="px-1 text-sm font-bold text-neutral-200 flex items-center gap-1.5">
          <CloudUpload className="w-3.5 h-3.5" style={{ color: theme.primary }} />
          Automatic backup
        </div>)}
        <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] divide-y divide-[#1A1E26] overflow-hidden">
          <div data-setting="drive-backup" data-hint="Pick your Google Drive folder here" className="setting-target">
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
          </div>
          <div data-setting="google-drive-backup" className="setting-target">
          <Row
            icon={<CloudUpload className="w-5 h-5 text-sky-300" />}
            title={backup.drive.on && backup.drive.connected ? 'Backing up to Google Drive' : 'Back up to Google Drive'}
            sub={
              !android
                ? 'Google Drive backup works in the Android app.'
                : !backup.drive.available
                  ? 'Needs Google Play services, which is not on this phone. The folder backup above still works.'
                  : backup.drive.on && backup.drive.connected
                    ? `Google only. Saved in a hidden folder in your own Google Drive that only this app can see, encrypted on your phone first. Once a day and after each new workout while the app is open; the last 7 copies are kept. Last backup ${ago(backup.drive.lastAt)}.`
                    : backup.drive.on
                      ? 'Google needs your permission again. Tap Connect Google Drive.'
                      : 'Google only. Google gives this app one permission: a hidden folder in your own Google Drive that only this app can see, and nothing else in your account. The backup is encrypted on your phone first, so Google stores a file it cannot read. It runs once a day and after each new workout, while the app is open.'
            }
            action={
              android && backup.drive.available ? (
                backup.drive.on && backup.drive.connected ? (
                  <button onClick={backup.backupNow} disabled={backup.working} className={btn}>
                    {backup.working ? 'Saving…' : 'Back up now'}
                  </button>
                ) : driveEnc ? (
                  <button onClick={backup.connectGoogleDrive} className={primary} style={{ backgroundColor: theme.primary }}>
                    Connect Google Drive
                  </button>
                ) : undefined
              ) : undefined
            }
          />
          </div>
          {android && backup.drive.available && !(backup.drive.on && backup.drive.connected) && !driveEnc && (
            <div className="px-4 py-3 space-y-2">
              <p className="text-xs leading-relaxed text-[#9AA3B2]">
                Choose a backup passphrase first. It locks the backup on your phone before it leaves, so only you can open it. If you forget it, the
                backups cannot be opened, and it is not stored anywhere you can recover it from.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={drivePass}
                  onChange={(e) => setDrivePass(e.target.value)}
                  placeholder="At least 8 characters"
                  aria-label="Backup passphrase"
                  className="min-h-11 flex-1 rounded-xl border border-neutral-700 bg-black/60 px-3 text-sm text-white"
                />
                <button
                  disabled={drivePass.length < 8}
                  onClick={async () => {
                    try {
                      await enableAutoEncryption(drivePass);
                      setDrivePass('');
                      setDriveEnc(true);
                      await backup.connectGoogleDrive();
                    } catch {
                      // the hook shows what went wrong under the card
                    }
                  }}
                  className={primary}
                  style={{ backgroundColor: theme.primary }}
                >
                  Set and connect
                </button>
              </div>
            </div>
          )}
          {android && backup.drive.available && backup.drive.on && backup.drive.connected && (
            <div className="px-4 py-3 flex flex-wrap items-center gap-2">
              {!confirmDriveRestore ? (
                <button onClick={() => setConfirmDriveRestore(true)} className={btn}>
                  <History className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                  Restore latest from Drive
                </button>
              ) : (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-amber-200">Replace everything with the newest Drive backup?</span>
                  <button onClick={backup.restoreFromGoogleDrive} className="text-rose-400 font-bold">
                    Yes
                  </button>
                  <button onClick={() => setConfirmDriveRestore(false)} className="text-neutral-400">
                    No
                  </button>
                </span>
              )}
              <button onClick={backup.disconnectGoogleDrive} className="text-xs text-neutral-400 hover:text-rose-400 ml-auto">
                Turn off
              </button>
            </div>
          )}
          {backup.drive.error && (
            <p role="alert" className="px-4 py-2 text-xs text-rose-400">
              {backup.drive.error}
            </p>
          )}
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
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-amber-200">Replace everything with the newest backup?</span>
                  <button onClick={backup.restoreLatest} className="text-rose-400 font-bold">
                    Yes
                  </button>
                  <button onClick={() => setConfirmRestore(false)} className="text-neutral-400">
                    No
                  </button>
                </span>
              )}
              <button onClick={backup.stop} className="text-xs text-neutral-400 hover:text-rose-400 ml-auto">
                Turn off
              </button>
            </div>
          )}
          {backup.error && (
            <p role="alert" className="px-4 py-2 text-xs text-rose-400">
              {backup.error}
            </p>
          )}
        </div>
      </div>
      )}

      {/* DIAGNOSTICS */}
      {part === 'diagnostics' && (
      <div className="space-y-2.5">
        {!hideTitles && (<div className="px-1 text-sm font-bold text-neutral-200 flex items-center gap-1.5">
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
              <pre className="max-h-56 overflow-auto text-xs leading-snug text-neutral-300 bg-black/50 border border-white/10 rounded-xl p-3 whitespace-pre-wrap break-words">
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
