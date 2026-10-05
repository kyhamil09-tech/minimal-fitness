import React from 'react';
import { Droplets, Eye, EyeOff, Hand, Lock, MonitorSmartphone, Navigation, Timer, Type, Vibrate, Volume2, Zap } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { UnitSystem } from '../types/tracking';
import { WorkoutType } from '../types/health';
import { usePrefs } from '../lib/prefs';
import { AppLock } from '../lib/native';
import { distanceUnit } from '../lib/units';
import { Choice, ChoiceRow, Row, Toggle } from './ui/SettingsParts';

const SPORTS: { id: WorkoutType; label: string }[] = [
  { id: 'Running', label: 'Run' },
  { id: 'Walking', label: 'Walk' },
  { id: 'Hiking', label: 'Hike' },
  { id: 'Cycling', label: 'Cycle' },
  { id: 'Strength', label: 'Strength' },
  { id: 'Treadmill', label: 'Treadmill' },
  { id: 'IndoorCycling', label: 'Indoor bike' },
  { id: 'Rowing', label: 'Row' },
  { id: 'HIIT', label: 'HIIT' },
  { id: 'Yoga', label: 'Yoga' },
  { id: 'Elliptical', label: 'Elliptical' },
  { id: 'Calisthenics', label: 'Bodyweight' },
];

/** The extra Run settings: screen, countdown, spoken updates, GPS battery, default activity, buzz and beat. */
export const RunPrefs: React.FC<{ theme: ColorPalette; units: UnitSystem; voiceCues: boolean }> = ({ units, voiceCues }) => {
  const { prefs, setPrefs } = usePrefs();
  const unit = distanceUnit(units);
  const distanceChoices = [0.5, 1, 2, 5].map((v) => ({ id: v, label: v + ' ' + unit }));
  return (
    <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] divide-y divide-[#1A1E26] overflow-hidden">
      <Row
        icon={<MonitorSmartphone className="w-5 h-5 text-sky-300" />}
        title="Keep the screen on"
        sub="Stops the screen from turning off while a workout is running. Turn it off to save battery; the run keeps recording either way."
        action={<Toggle on={prefs.keepScreenOn} onChange={(v) => setPrefs({ keepScreenOn: v })} label="Keep the screen on during workouts" />}
      />
      <Row
        icon={<Timer className="w-5 h-5 text-amber-300" />}
        title="Start countdown"
        sub="Counts 3, 2, 1 before a workout begins, so you can put the phone away first."
        action={<Toggle on={prefs.startCountdown} onChange={(v) => setPrefs({ startCountdown: v })} label="Start countdown" />}
      />
      <Row
        icon={<Vibrate className="w-5 h-5 text-violet-300" />}
        title="Light haptics on taps"
        sub="A very small tick when you press a button or choose something, and a gentle pulse when a ring closes or a record is set."
        action={<Toggle on={prefs.uiHaptics} onChange={(v) => setPrefs({ uiHaptics: v })} label="Light haptics on taps" />}
      />
      <Row
        icon={<Navigation className="w-5 h-5 text-emerald-300" />}
        title="Offer to record runs and rides"
        sub="When your phone notices you have been running or cycling for a few minutes, a notification offers to record it. It never starts by itself and stays quiet while a workout is recording. Uses Android's activity recognition on this phone: nothing is sent anywhere."
        action={<Toggle on={prefs.detectWorkouts} onChange={(v) => setPrefs({ detectWorkouts: v })} label="Offer to record runs and rides" />}
      />
      {prefs.detectWorkouts && (
        <Row
          icon={<Navigation className="w-5 h-5 text-sky-300" />}
          title="Also offer for walks"
          sub="After about 12 minutes of walking. Off by default because everyday walking is frequent."
          action={<Toggle on={prefs.detectWalks} onChange={(v) => setPrefs({ detectWalks: v })} label="Also offer for walks" />}
        />
      )}
      <ChoiceRow
        title="Heart-rate zones"
        sub="Reserve works the zones out from the gap between your resting and your highest heart rate, so they fit your own fitness. Max uses a plain share of your highest heart rate. Your resting heart rate comes from your watch when it has one."
      >
        <Choice
          label="Heart-rate zones"
          value={prefs.zoneMethod}
          onChange={(v) => setPrefs({ zoneMethod: v })}
          options={[
            { id: 'reserve', label: 'Heart-rate reserve' },
            { id: 'max', label: '% of max' },
          ]}
        />
      </ChoiceRow>
      <ChoiceRow title="Cycling threshold power" sub="Your best steady power for an hour, in watts. Used for power load and zones on rides with a power meter. Auto works it out from your best 20-minute efforts once you have them.">
        <Choice
          label="Threshold power"
          value={prefs.ftpW}
          onChange={(v) => setPrefs({ ftpW: v })}
          options={[0, 150, 180, 200, 220, 250, 280, 300, 350].map((v) => ({ id: v, label: v === 0 ? 'Auto' : `${v} W` }))}
        />
      </ChoiceRow>
      <ChoiceRow title="Wheel size" sub="For speed from a Bluetooth wheel sensor: the distance one turn of the wheel covers.">
        <Choice
          label="Wheel size"
          value={prefs.wheelMm}
          onChange={(v) => setPrefs({ wheelMm: v })}
          options={[
            { id: 2096, label: '700×23c' },
            { id: 2105, label: '700×25c' },
            { id: 2136, label: '700×28c' },
            { id: 2288, label: '29×2.1' },
          ]}
        />
      </ChoiceRow>
      {voiceCues && (
        <>
          <ChoiceRow title="Spoken update every" sub="Announce by distance or by time.">
            <Choice
              label="Spoken update basis"
              value={prefs.voiceMode}
              onChange={(v) => setPrefs({ voiceMode: v })}
              options={[
                { id: 'distance', label: 'Distance' },
                { id: 'time', label: 'Time' },
              ]}
            />
            {prefs.voiceMode === 'distance' ? (
              <Choice label="Distance between updates" value={prefs.voiceDistance} onChange={(v) => setPrefs({ voiceDistance: v })} options={distanceChoices} />
            ) : (
              <Choice
                label="Minutes between updates"
                value={prefs.voiceMinutes}
                onChange={(v) => setPrefs({ voiceMinutes: v })}
                options={[2, 5, 10, 15].map((v) => ({ id: v, label: v + ' min' }))}
              />
            )}
          </ChoiceRow>
          <ChoiceRow title="What it says" sub="Heart rate is set above. Pick the rest here.">
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  ['voiceSayDistance', 'Distance'],
                  ['voiceSayTime', 'Time'],
                  ['voiceSayPace', 'Pace'],
                ] as const
              ).map(([key, label]) => (
                <button key={key} onClick={() => setPrefs({ [key]: !prefs[key] })} aria-pressed={prefs[key]} className="sport-pill !py-1.5 !px-3.5 !text-xs">
                  {label}
                </button>
              ))}
            </div>
          </ChoiceRow>
        </>
      )}
      <Row
        icon={<Navigation className="w-5 h-5 text-emerald-300" />}
        title="GPS battery saver"
        sub="Records your position every 5 seconds instead of every second. Good for long walks and hikes; runs with sharp turns may look a little rounder."
        action={<Toggle on={prefs.gpsSaver} onChange={(v) => setPrefs({ gpsSaver: v })} label="GPS battery saver" />}
      />
      <ChoiceRow title="Default activity" sub="Preselected on the Start screen. 'Last used' remembers your most recent one.">
        <Choice
          label="Default activity"
          value={prefs.defaultSport}
          onChange={(v) => setPrefs({ defaultSport: v })}
          options={[{ id: 'last' as const, label: 'Last used' }, ...SPORTS]}
        />
      </ChoiceRow>
      <Row
        icon={<Vibrate className="w-5 h-5 text-rose-300" />}
        title="Buzz when a goal is reached"
        sub="A short vibration when you hit your distance, time or calorie goal."
        action={<Toggle on={prefs.hapticsGoals} onChange={(v) => setPrefs({ hapticsGoals: v })} label="Buzz when a goal is reached" />}
      />
      <Row
        icon={<Hand className="w-5 h-5 text-rose-300" />}
        title="Buzz at interval steps"
        sub="A buzz at the start and at every step change of an interval workout, and on each countdown number."
        action={<Toggle on={prefs.hapticsSteps} onChange={(v) => setPrefs({ hapticsSteps: v })} label="Buzz at interval steps" />}
      />
      <Row
        icon={<Zap className="w-5 h-5 text-rose-300" />}
        title="Buzz for pace and heart-rate alerts"
        sub="A buzz when you drift off your target pace or heart-rate zone."
        action={<Toggle on={prefs.hapticsAlerts} onChange={(v) => setPrefs({ hapticsAlerts: v })} label="Buzz for alerts" />}
      />
      <ChoiceRow title="Cadence beat sound" sub="How the beat sounds and how loud it is. Use Hear it on the Start screen to try it.">
        <Choice
          label="Beat sound"
          value={prefs.beatSound}
          onChange={(v) => setPrefs({ beatSound: v })}
          options={[
            { id: 'click', label: 'Click' },
            { id: 'wood', label: 'Wood block' },
            { id: 'beep', label: 'Beep' },
          ]}
        />
        <div className="flex items-center gap-3">
          <Volume2 className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={prefs.beatVolume}
            onChange={(e) => setPrefs({ beatVolume: Number(e.target.value) })}
            aria-label="Beat volume"
            className="flex-1"
          />
          <span className="text-xs font-mono text-neutral-300 w-9 text-right">{prefs.beatVolume}%</span>
        </div>
      </ChoiceRow>
    </div>
  );
};

/** The extra Look and feel settings: swipe, opening screen, week start, text size and motion. */
export const LookPrefs: React.FC<{ showCycle?: boolean }> = ({ showCycle = false }) => {
  const { prefs, setPrefs } = usePrefs();
  const [lockMsg, setLockMsg] = React.useState('');
  return (
    <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] divide-y divide-[#1A1E26] overflow-hidden">
      <Row
        icon={<Hand className="w-5 h-5 text-sky-300" />}
        title="Swipe between tabs"
        sub="Swipe left or right on a screen to move to the next or previous tab. Turn it off if it triggers by accident."
        action={<Toggle on={prefs.swipeTabs} onChange={(v) => setPrefs({ swipeTabs: v })} label="Swipe between tabs" />}
      />
      <ChoiceRow title="Open the app on">
        <Choice
          label="Opening screen"
          value={prefs.defaultTab}
          onChange={(v) => setPrefs({ defaultTab: v })}
          options={[
            { id: 'today', label: 'Home' },
            { id: 'exercise', label: 'Run' },
          ]}
        />
      </ChoiceRow>
      <ChoiceRow title="Week starts on" sub="Weekly totals, the week strip and the activity calendar. Training plans always run Monday to Sunday.">
        <Choice
          label="Week starts on"
          value={prefs.weekStart}
          onChange={(v) => setPrefs({ weekStart: v })}
          options={[
            { id: 'mon', label: 'Monday' },
            { id: 'sun', label: 'Sunday' },
          ]}
        />
      </ChoiceRow>
      <ChoiceRow
        title="Background glow"
        sub="Soft, slowly drifting light in your theme colours behind the screens. On tab change shows it for a few seconds after you switch tabs and is the easiest on the battery. Always keeps it drifting, and switches back to tab changes when the battery is low. Hidden during workouts and with Reduce motion."
      >
        <Choice
          label="Background glow"
          value={prefs.glow}
          onChange={(v) => setPrefs({ glow: v })}
          options={[
            { id: 'off', label: 'Off' },
            { id: 'tabs', label: 'On tab change' },
            { id: 'always', label: 'Always' },
          ]}
        />
      </ChoiceRow>
      <Row
        icon={<Droplets className="w-5 h-5 text-sky-300" />}
        title="Liquid glass"
        sub="Frosted, see-through cards and bars with soft highlights on the edges, over the background glow. With the glow turned off it shows a still, non-moving glow. Using Always glow together with this uses more battery."
        action={<Toggle on={prefs.liquidGlass} onChange={(v) => setPrefs({ liquidGlass: v })} label="Liquid glass" />}
      />
      <Row
        icon={<Lock className="w-5 h-5 text-emerald-300" />}
        title="App lock"
        sub={lockMsg || "Ask for your fingerprint, face or screen lock when the app opens or when you come back after 30 seconds away. It never locks while a workout is recording. Android checks it; the app only hears yes or no."}
        action={
          <Toggle
            on={prefs.appLock}
            onChange={async (v) => {
              if (!v) return setPrefs({ appLock: false });
              try {
                const a = await AppLock.available();
                if (!a.available) return setLockMsg('Set up a screen lock or fingerprint in Android settings first.');
                const r = await AppLock.authenticate({ title: 'Turn on app lock' });
                if (r.ok) {
                  setLockMsg('');
                  setPrefs({ appLock: true });
                } else setLockMsg('App lock was not turned on.');
              } catch {
                setLockMsg('App lock is only available in the Android app.');
              }
            }}
            label="App lock"
          />
        }
      />
      {/* Only offered when the profile says female; for any other profile the cycle card and this switch are both hidden. */}
      {showCycle && (
        <Row
          icon={<Droplets className="w-5 h-5 text-rose-300" />}
          title="Menstrual cycle tracking"
          sub="Optional. Log your period start dates by hand and Home shows your cycle phase with training notes. Stays on this phone: nothing is sent anywhere or written to Health Connect."
          action={<Toggle on={prefs.cycleTracking} onChange={(v) => setPrefs({ cycleTracking: v })} label="Menstrual cycle tracking" />}
        />
      )}
      <Row
        icon={<EyeOff className="w-5 h-5 text-emerald-300" />}
        title="Hide in recent apps"
        sub="Blanks the app's picture in Android's recent-apps list and blocks screenshots, so health data is not visible there."
        action={<Toggle on={prefs.hideInRecents} onChange={(v) => setPrefs({ hideInRecents: v })} label="Hide in recent apps" />}
      />
      <Row
        icon={<Type className="w-5 h-5 text-violet-300" />}
        title="Larger text"
        sub="Makes most text in the app bigger. Small labels may stay small."
        action={<Toggle on={prefs.largeText} onChange={(v) => setPrefs({ largeText: v })} label="Larger text" />}
      />
      <Row
        icon={<Eye className="w-5 h-5 text-violet-300" />}
        title="Reduce motion"
        sub="Turns off the slide and fade animations, and the pulsing GO button."
        action={<Toggle on={prefs.reduceMotion} onChange={(v) => setPrefs({ reduceMotion: v })} label="Reduce motion" />}
      />
    </div>
  );
};
