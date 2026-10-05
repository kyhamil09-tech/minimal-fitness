import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Check, CloudOff, Database, Globe, Lock, MessageSquare, Share2, ShieldCheck, Wifi, X } from 'lucide-react';
import { useLiveShare } from '../lib/liveShare';
import { ColorPalette } from '../types/theme';
import { NET_FEATURES } from '../lib/netHosts';
import {
  NET_CHANGED,
  NetEntry,
  activeSecurityPolicy,
  clearNetLog,
  readNetLog,
  readNetPrefs,
  readNetTotals,
  writeNetPrefs,
} from '../lib/netGuard';
import {
  AndroidPrivacyInfo,
  describePermissions,
  formatBytes,
  readAndroidPrivacyInfo,
  readLocalDataSizes,
  summarizeLocalData,
} from '../lib/privacyInfo';
import { isConnected as stravaConnected } from '../lib/strava';
import { isAndroidApp } from '../lib/native';
import { Toggle } from './ui/SettingsParts';

const card = 'rounded-2xl bg-[#0B0D11] border border-[#1A1E26] overflow-hidden';
const head = 'px-1 text-xs font-semibold uppercase tracking-wider text-[#7E889B]';

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });

const weatherOn = (): boolean => {
  try {
    return localStorage.getItem('kyfit_weather_on') === 'true';
  } catch {
    return false;
  }
};

const Fact: React.FC<{ ok: boolean; children: React.ReactNode }> = ({ ok, children }) => (
  <li className="flex items-start gap-2.5 px-4 py-2.5 text-xs leading-relaxed text-neutral-200">
    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
    </span>
    <span>{children}</span>
  </li>
);

/** The proof that your data stays on this phone: what can reach the internet, a live log of every request, and Android's own counters. */
export const PrivacyPanel: React.FC<{ theme: ColorPalette }> = ({ theme }) => {
  const [, bump] = useState(0);
  const [info, setInfo] = useState<AndroidPrivacyInfo | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const android = isAndroidApp();
  const [share] = useLiveShare();

  useEffect(() => {
    const again = () => bump((n) => n + 1);
    window.addEventListener(NET_CHANGED, again);
    return () => window.removeEventListener(NET_CHANGED, again);
  }, []);

  const refreshInfo = useCallback(() => void readAndroidPrivacyInfo().then(setInfo), []);
  useEffect(() => {
    refreshInfo();
    const id = setInterval(refreshInfo, 10_000);
    return () => clearInterval(id);
  }, [refreshInfo]);

  const prefs = readNetPrefs();
  const totals = readNetTotals();
  const log: NetEntry[] = readNetLog();
  const policy = activeSecurityPolicy();
  const connectSrc = (policy.match(/connect-src ([^;]+)/)?.[1] ?? '').split(' ').filter((s) => s.startsWith('https://')).map((s) => s.replace('https://', ''));
  const local = useMemo(() => summarizeLocalData(readLocalDataSizes()), [log.length]);
  const permissions = info ? describePermissions(info.permissions) : [];

  const stateOf = (id: string): { on: boolean; text: string } => {
    if (prefs.offline) return { on: false, text: 'Blocked by Offline mode' };
    if (id === 'maps') return prefs.maps ? { on: true, text: 'On' } : { on: false, text: 'Off' };
    if (id === 'food') return prefs.food ? { on: true, text: 'On' } : { on: false, text: 'Off' };
    if (id === 'weather') return weatherOn() ? { on: true, text: 'On' } : { on: false, text: 'Off (turn it on from the weather card on Home)' };
    return stravaConnected() ? { on: true, text: 'Connected' } : { on: false, text: 'Not connected: sends nothing' };
  };

  return (
    <div className="space-y-4">
      {/* The promise */}
      <section className="rounded-2xl border p-5" style={{ borderColor: `${theme.primary}40`, backgroundColor: `${theme.primary}0D` }}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${theme.primary}22`, color: theme.primary }}>
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <h3 className="gh-title !text-[1.35rem]">Your data stays on this phone</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-300">
              There is no account, no server and no analytics, ads or crash-reporting service in this app. Nothing is ever sent to the developer or to any company.
              The only internet use is the small list below, and you can see every request, switch each one off, or block them all.
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-300">
              The one other way anything leaves the phone is <span className="font-semibold text-white">Live share</span>, which is off until you turn it on: it texts a map link to the people you pick, by SMS, not the internet. It is described in full below.
            </p>
          </div>
        </div>
      </section>

      {/* Live proof */}
      <div className="space-y-2.5">
        <div className={head}>Proof, updated live</div>
        <div className="grid grid-cols-3 gap-2.5 text-center">
          <div className="rounded-2xl glass-inset px-2 py-3">
            <div className="hero-num text-[1.9rem] text-white">{totals.requests}</div>
            <div className="mt-1 text-[10px] leading-tight text-neutral-400">requests made since {new Date(totals.since).toLocaleDateString([], { month: 'short', day: 'numeric' })}</div>
          </div>
          <div className="rounded-2xl glass-inset px-2 py-3">
            <div className="hero-num text-[1.9rem] text-white">{totals.blocked}</div>
            <div className="mt-1 text-[10px] leading-tight text-neutral-400">blocked by your settings or the security policy</div>
          </div>
          <div className="rounded-2xl glass-inset px-2 py-3">
            <div className="hero-num text-[1.9rem] text-white">{info ? formatBytes(info.txBytes) : android ? '…' : '—'}</div>
            <div className="mt-1 text-[10px] leading-tight text-neutral-400">sent, counted by Android itself since the phone started</div>
          </div>
        </div>
        <p className="px-1 text-[10px] leading-relaxed text-neutral-500">
          {android
            ? `The third number comes from Android's own network counter for this app, which the app cannot change${info && info.rxBytes >= 0 ? `; it has also received ${formatBytes(info.rxBytes)}, mostly map pictures` : ''}. The first two come from the app's request log below, which counts only what the request itself holds. Android's number is a little larger because it also counts the connection overhead.`
            : 'Android’s own byte counter is shown in the Android app.'}
        </p>
      </div>

      {/* Switches */}
      <div className="space-y-2.5">
        <div className={head}>What can use the internet</div>
        <div className={`${card} divide-y divide-[#1A1E26]`}>
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900">
                <CloudOff className="h-5 w-5 text-emerald-300" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Offline mode</div>
                <div className="mt-0.5 text-xs leading-relaxed text-[#7E889B]">
                  Blocks every request the app makes. Workouts, sleep, charts and the watch all keep working, and maps you have already seen still draw.
                </div>
              </div>
            </div>
            <Toggle on={prefs.offline} onChange={(v) => writeNetPrefs({ offline: v })} label="Offline mode" />
          </div>
          {NET_FEATURES.map((f) => {
            const st = stateOf(f.id);
            const switchable = f.id === 'maps' || f.id === 'food';
            return (
              <div key={f.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Globe className="h-4 w-4 shrink-0 text-neutral-400" />
                      {f.label}
                    </div>
                    <div className="mt-1 break-words font-mono text-[10px] text-neutral-500">{f.hosts.join(' · ')}</div>
                  </div>
                  {switchable ? (
                    <Toggle on={f.id === 'maps' ? prefs.maps : prefs.food} onChange={(v) => writeNetPrefs(f.id === 'maps' ? { maps: v } : { food: v })} label={`${f.label} may use the internet`} />
                  ) : (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${st.on ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-neutral-400'}`}>{st.on ? 'On' : 'Off'}</span>
                  )}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
                  <span className="font-semibold text-neutral-200">Sends: </span>
                  {f.sends}
                </p>
                <p className="mt-1 text-[10px] text-neutral-500">{st.text}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live share */}
      <div className="space-y-2.5">
        <div className={head}>Live share (text messages)</div>
        <div className={`${card} p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <MessageSquare className="h-4 w-4 shrink-0 text-neutral-400" />
              Text my location during workouts
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${share.enabled ? 'bg-amber-500/15 text-amber-300' : 'bg-white/10 text-neutral-400'}`}>{share.enabled ? 'On' : 'Off'}</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
            <span className="font-semibold text-neutral-200">Sends: </span>
            to {share.enabled ? share.contacts.map((c) => c.name).join(', ') : 'nobody while it is off'}: your name, the activity, time, distance and battery level, and a map address of where you are. A text goes out when you start, every {share.everyMin} minutes, if you stop moving for 5 minutes, when you finish, and when you press SOS.
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-400">
            <span className="font-semibold text-neutral-200">How: </span>
            as an ordinary text message from this phone (SEND_SMS permission), through your phone company. It does not use the internet, it does not pass through any server of this app, and Offline mode does not affect it. The map address is a plain link: only the person who opens it contacts a map service.
          </p>
          <p className="mt-1.5 text-[10px] text-neutral-500">
            {share.enabled ? 'Every text is listed in Settings > Safety live share, and in your phone’s messages app.' : 'Nothing is texted until you add a contact and switch it on in Settings > Safety live share.'}
          </p>
        </div>
      </div>

      {/* The log */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className={head}>Every request, as sent</div>
          <button onClick={() => setShowLog((v) => !v)} className="text-[11px] font-bold" style={{ color: theme.primary }}>
            {showLog ? 'Hide' : `Show last ${Math.min(log.length, 150)}`}
          </button>
        </div>
        {showLog && (
          <div className={card}>
            {log.length === 0 ? (
              <p className="p-4 text-xs text-neutral-400">The app has not contacted anything yet.</p>
            ) : (
              <ul className="max-h-72 divide-y divide-[#1A1E26] overflow-y-auto">
                {[...log].reverse().map((e, i) => (
                  <li key={`${e.t}-${i}`} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-mono text-neutral-500">{clock(e.t)}</span>
                      <span className={e.result === 'ok' ? 'text-sky-300' : e.result === 'blocked' ? 'text-amber-300' : 'text-rose-300'}>
                        {e.result === 'ok' ? `sent · ${e.status ?? ''}` : e.result === 'blocked' ? 'blocked' : 'failed'}
                      </span>
                    </div>
                    <div className="mt-0.5 break-all font-mono text-[11px] text-neutral-200">
                      {e.method} {e.host}
                      {e.path}
                    </div>
                    {e.why && <div className="mt-0.5 text-[10px] text-amber-200/80">{e.why}</div>}
                  </li>
                ))}
              </ul>
            )}
            {log.length > 0 && (
              <div className="border-t border-[#1A1E26] p-3">
                <button onClick={() => clearNetLog()} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-semibold text-neutral-200">
                  Clear the list
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Locked down */}
      <div className="space-y-2.5">
        <div className={head}>Locked down by design</div>
        <ul className={`${card} divide-y divide-[#1A1E26]`}>
          <Fact ok={policy !== ''}>
            {policy !== ''
              ? `The app’s web view is allowed to contact only: ${connectSrc.join(', ')}. Anything else is refused by Android’s web engine, not just by this app.`
              : 'The web-view security policy is added to the installed app. It is not active in this preview.'}
          </Fact>
          <Fact ok={!info || !info.cleartextAllowed}>Unencrypted (plain HTTP) internet traffic is not allowed at all.</Fact>
          <Fact ok={!info || !info.backupAllowed}>
            Google cloud backup and phone-to-phone transfer of this app’s data are off, so Android never uploads it to Google Drive. Use the backup folder you choose in Data & backup.
          </Fact>
          <Fact ok>The Strava connection is made by native code that can only reach www.strava.com, and only after you connect it.</Fact>
          <Fact ok>Texting is limited to Live share: the app only texts numbers you added yourself, never anyone else, and it asks Android for the SMS permission only when you switch Live share on.</Fact>
          <Fact ok>Crash and error logs are kept on this phone only. Sharing one is always your action.</Fact>
          <Fact ok>Fonts, maps drawing code and every screen are packaged inside the app. Nothing is downloaded and run.</Fact>
        </ul>
      </div>

      {/* Where it lives */}
      <div className="space-y-2.5">
        <div className={head}>Where your data lives</div>
        <div className={card}>
          <div className="flex items-center gap-3 border-b border-[#1A1E26] p-4">
            <Database className="h-5 w-5 shrink-0 text-neutral-300" />
            <div className="text-xs leading-relaxed text-neutral-300">
              <span className="font-semibold text-white">{formatBytes(local.totalBytes)}</span> stored in this app’s private storage on the phone. Other apps cannot read it, and it is removed if you uninstall or erase everything.
            </div>
          </div>
          <ul className="divide-y divide-[#1A1E26]">
            {local.groups.map((g) => (
              <li key={g.label} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="text-neutral-300">{g.label}</span>
                <span className="font-mono text-neutral-400">{formatBytes(g.bytes)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Permissions */}
      {android && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className={head}>Permissions it asks Android for</div>
            <button onClick={() => setShowPerms((v) => !v)} className="text-[11px] font-bold" style={{ color: theme.primary }}>
              {showPerms ? 'Hide' : `Show ${permissions.length}`}
            </button>
          </div>
          {showPerms && (
            <ul className={`${card} divide-y divide-[#1A1E26]`}>
              {permissions.map((p, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs">
                  <span className="text-neutral-300">{p.label}</span>
                  <span className={`shrink-0 text-[10px] font-bold ${p.granted ? 'text-emerald-300' : 'text-neutral-500'}`}>{p.granted ? 'allowed' : 'not allowed'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Leaves only when you act */}
      <div className="space-y-2.5">
        <div className={head}>Leaves the phone only when you press it</div>
        <ul className={`${card} divide-y divide-[#1A1E26]`}>
          {[
            ['Share a workout', 'Opens Android’s share sheet. It goes to the app you pick, nowhere else.'],
            ['Export a GPX route or a backup file', 'Saved to a place you choose.'],
            ['Upload to Strava', 'Only if you connected Strava, and only the workout you chose (or all of them if you turned on automatic upload).'],
            ['Open a route in Google Maps', 'Opens Google Maps with that route’s address.'],
            ['Live share texts', 'Only if you switched it on and added a contact: a text with a map link goes to the people you chose, by SMS. The SOS button on a live run sends one at once.'],
          ].map(([t, d]) => (
            <li key={t} className="flex items-start gap-3 px-4 py-2.5">
              <Share2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
              <div className="text-xs leading-relaxed">
                <span className="font-semibold text-neutral-200">{t}. </span>
                <span className="text-neutral-400">{d}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Honest limits */}
      <div className="space-y-2.5">
        <div className={head}>Software on your phone this app relies on</div>
        <div className={`${card} p-4 text-[11px] leading-relaxed text-neutral-400`}>
          <p>
            <span className="font-semibold text-neutral-200">Google Play services</span> provides the phone’s sleep detection and the link to your watch. <span className="font-semibold text-neutral-200">Health Connect</span> holds the health data you allow this app to read and write, on the phone.
            The <span className="font-semibold text-neutral-200">Google Health / Fitbit app</span> is a separate app with its own privacy policy and is what uploads your watch data to Google: this app only reads what that app puts into Health Connect. These are Google software on your phone, governed by your Google settings, and this app never sends your data to them.
          </p>
        </div>
      </div>

      {/* Check it yourself */}
      <div className="space-y-2.5">
        <div className={head}>Check it yourself</div>
        <ol className={`${card} space-y-2 p-4 text-xs leading-relaxed text-neutral-300`}>
          <li className="flex gap-2.5">
            <Wifi className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
            <span>Turn on Offline mode (or airplane mode) and use the app all day. Everything still works.</span>
          </li>
          <li className="flex gap-2.5">
            <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
            <span>In Android Settings, Apps, Minimal Fitness, Mobile data and Wi-Fi: the usage there is Android’s own record, kept apart from this app.</span>
          </li>
          <li className="flex gap-2.5">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
            <span>The log above shows each address exactly as it was sent. You will only ever see the services listed above.</span>
          </li>
        </ol>
      </div>
    </div>
  );
};
