import React, { useState } from 'react';
import { Activity, BedDouble, CloudUpload, HeartHandshake, MapPin, Navigation, Radar, ShieldCheck, Upload, Watch } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { usePrefs } from '../lib/prefs';
import { sleepDetectEnabled, setSleepDetectEnabled, startSleepDetect, stopSleepDetect } from '../lib/sleepDetect';
import { Toggle } from './ui/SettingsParts';
import { driveBackupOn } from '../lib/driveBackup';

const card = 'rounded-2xl bg-[#0B0D11] border border-[#1A1E26] overflow-hidden';
const head = 'px-1 text-xs font-semibold uppercase tracking-wider text-[#9AA3B2]';

/** One Google component: what it is, what this app gets from it, and a switch when there is one. */
const Piece: React.FC<{
  icon: React.ReactNode;
  title: string;
  gets: string;
  needsPlay?: boolean;
  playServices?: boolean;
  action?: React.ReactNode;
}> = ({ icon, title, gets, needsPlay, playServices, action }) => (
  <div className="p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900">{icon}</div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{title}</div>
          <p className="mt-1 text-xs leading-relaxed text-[#9AA3B2]">{gets}</p>
          {needsPlay && playServices === false && (
            <p className="mt-1 text-xs font-semibold text-amber-300">Google Play services is not on this phone, so this stays off. The rest of the app works.</p>
          )}
        </div>
      </div>
      {action}
    </div>
  </div>
);

interface GoogleServicesPanelProps {
  theme: ColorPalette;
  /** Whether Google Play services is on this phone (undefined while it is being read, or in a browser). */
  playServices?: boolean;
  android: boolean;
}

/**
 * Every Google component this app uses, what it gives the app, and a switch where there is one. Google only: this app has no account
 * or sign-in today; if one is ever added it will be Google's and nobody else's. The pieces listed here run on the phone, inside Google's
 * own apps, so Android's byte counter for this app (above) does not include them.
 */
export const GoogleServicesPanel: React.FC<GoogleServicesPanelProps> = ({ theme, playServices, android }) => {
  const { prefs, setPrefs } = usePrefs();
  const [sleepOn, setSleepOn] = useState<boolean>(sleepDetectEnabled);

  return (
    <div className="space-y-2.5">
      <div className={head}>Google services on this phone</div>

      <section className="rounded-2xl border p-4" style={{ borderColor: `${theme.primary}40`, backgroundColor: `${theme.primary}0D` }}>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${theme.primary}22`, color: theme.primary }}>
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="text-xs leading-relaxed text-neutral-300">
            <div className="text-sm font-bold text-white">Google only</div>
            <p className="mt-1">
              This app has no sign-in today. If an account is ever added, it will be a Google account and nobody else’s: no other company’s
              sign-in, ever. Other connections that exist (maps, food, weather and optional Strava) are listed above, each with its own switch.
            </p>
            <p className="mt-1.5 text-neutral-400">
              {!android
                ? 'Google Play services status is shown in the Android app.'
                : playServices === undefined
                  ? 'Checking Google Play services…'
                  : playServices
                    ? 'Google Play services is on this phone.'
                    : 'Google Play services is not on this phone. Everything below that needs it is off, and the app still works.'}
            </p>
          </div>
        </div>
      </section>

      <div className={`${card} divide-y divide-[#1A1E26]`}>
        <Piece
          icon={<HeartHandshake className="h-4 w-4 text-violet-300" />}
          title="Health Connect: receive"
          gets="Android’s store on this phone. This app reads the sleep, steps and heart rate that your watch, band or ring apps saved there. It sends nothing to Google."
          action={<Toggle on={prefs.useHealthConnect} onChange={(v) => setPrefs({ useHealthConnect: v })} label="Receive from Health Connect" />}
        />
        <Piece
          icon={<Upload className="h-4 w-4 text-sky-300" />}
          title="Health Connect: send"
          gets="Off means this app only receives: nothing you log or record here is saved to Health Connect. On lets other apps you allow read your workouts, meals, water, weight and sleep."
          action={
            <Toggle
              on={prefs.useHealthConnect && prefs.writeHealthConnect}
              onChange={(v) => setPrefs(v ? { useHealthConnect: true, writeHealthConnect: true } : { writeHealthConnect: false })}
              label="Send to Health Connect"
            />
          }
        />
        <Piece
          icon={<Navigation className="h-4 w-4 text-emerald-300" />}
          title="Drive detection"
          needsPlay
          playServices={playServices}
          gets="Google Play services’ activity recognition says when you get into a vehicle and out again. This app keeps only those start and end times, on this phone, to take the steps a car shakes into the counter off the day. It never gets your location from this."
          action={<Toggle on={prefs.autoDriveSteps} onChange={(v) => setPrefs({ autoDriveSteps: v })} label="Drive detection" />}
        />
        <Piece
          icon={<Activity className="h-4 w-4 text-amber-300" />}
          title="Workout suggestions"
          needsPlay
          playServices={playServices}
          gets="The same activity recognition offers to record a run or a ride when you start one. It never starts a workout by itself."
          action={<Toggle on={prefs.detectWorkouts} onChange={(v) => setPrefs({ detectWorkouts: v })} label="Workout suggestions" />}
        />
        <Piece
          icon={<BedDouble className="h-4 w-4 text-indigo-300" />}
          title="Sleep detection by the phone"
          needsPlay
          playServices={playServices}
          gets="Google Play services’ Sleep API works out when you went to bed and woke up from the phone’s own sensors. This app receives the times only."
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
                label="Sleep detection by the phone"
              />
            ) : undefined
          }
        />
        <Piece
          icon={<Watch className="h-4 w-4 text-emerald-300" />}
          title="Phone and watch link"
          needsPlay
          playServices={playServices}
          gets="Wear OS moves workouts, heart rate and sleep between your watch and this phone. This app has no switch for it; it is on while a Wear OS watch is paired and has the watch app. The app itself contacts no server for this."
        />
        <Piece
          icon={<CloudUpload className="h-4 w-4 text-sky-300" />}
          title="Google Drive backup"
          needsPlay
          playServices={playServices}
          gets={`${driveBackupOn() ? 'On.' : 'Off.'} Saves an encrypted backup into a hidden folder in your own Google Drive that only this app can see. Google gives the app one permission for that folder and nothing else in your account. Turn it on or off under Settings > Backup.`}
        />
        <Piece
          icon={<MapPin className="h-4 w-4 text-rose-300" />}
          title="Location"
          gets="The phone’s own GPS is used first, with nothing from Google. Google’s location service is only a backup, used if the phone’s GPS cannot start."
        />
      </div>

      <div className="flex items-start gap-2.5 px-1 text-xs leading-relaxed text-neutral-400">
        <Radar className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          These pieces run on your phone inside Google’s own apps, with their own network access, so the byte counter above (which is for this
          app only) does not include them. Google says activity recognition and the Sleep API work on the device; this app cannot check that.
          Google’s own apps, such as Fitbit, Google Health and Drive, sync to Google under your Google account. This app can read what they
          share through Health Connect but cannot control their uploads.
        </p>
      </div>
    </div>
  );
};
