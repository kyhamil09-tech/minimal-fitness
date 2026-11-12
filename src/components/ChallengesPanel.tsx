import React, { useMemo, useState } from 'react';
import { Check, ClipboardPaste, Copy, Plus, QrCode, ScanLine, Share2, Trash2, Trophy, UserPlus } from 'lucide-react';
import { QrScan, QrShow } from './QrSheet';
import { ColorPalette } from '../types/theme';
import { WorkoutSession } from '../types/health';
import { UnitSystem } from '../types/tracking';
import { usePersistentState } from '../hooks/usePersistentState';
import { usePrefs } from '../lib/prefs';
import { kmToDisplay, distanceUnit } from '../lib/units';
import { shareText } from '../lib/shareText';
import { ClipboardRead, isAndroidApp } from '../lib/native';
import {
  Challenge,
  ChallengeEntry,
  ChallengeMetric,
  LENGTHS_DAYS,
  METRICS,
  addUpdates,
  classifyPaste,
  standingsMessage,
  challengeStatus,
  cleanName,
  decodeChallenge,
  encodeChallenge,
  encodeUpdate,
  joinChallenge,
  leaderboard,
  myDays,
  newChallenge,
  sum,
} from '../lib/challenges';
import { Row, Toggle } from './ui/SettingsParts';

interface ChallengesPanelProps {
  theme: ColorPalette;
  steps: Record<string, number>;
  workouts: WorkoutSession[];
  units: UnitSystem;
}

const input = 'min-h-11 w-full rounded-xl border border-neutral-700 bg-black/40 px-3 text-sm text-white placeholder:text-neutral-500';
const btn = 'min-h-11 px-4 rounded-xl border border-neutral-700 text-xs font-semibold text-neutral-200 hover:text-white inline-flex items-center justify-center gap-1.5';

/** The text a total is shown with: kilometers become miles for people who use them. */
const show = (metric: ChallengeMetric, value: number, units: UnitSystem): string => {
  if (metric === 'distance') return `${kmToDisplay(value, units, 1)} ${distanceUnit(units)}`;
  if (metric === 'volume') return units === 'imperial' ? `${Math.round(value * 2.20462).toLocaleString()} lb` : `${Math.round(value).toLocaleString()} kg`;
  return `${Math.round(value).toLocaleString()} ${metric === 'steps' ? 'steps' : metric === 'minutes' ? 'min' : value === 1 ? 'workout' : 'workouts'}`;
};

/**
 * Friends and challenges, with no accounts and no server. Off until the person turns it on. A challenge is a short code, an update is a
 * short code, and both go through whatever app they choose to share with. See lib/challenges.ts for what a code contains.
 */
export const ChallengesPanel: React.FC<ChallengesPanelProps> = ({ theme, steps, workouts, units }) => {
  const { prefs, setPrefs } = usePrefs();
  const [name, setName] = usePersistentState<string>('challenge_name', '');
  const [challenges, setChallenges] = usePersistentState<Challenge[]>('challenges', []);
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState<ChallengeMetric>('steps');
  const [days, setDays] = useState<number>(7);
  const [paste, setPaste] = useState('');
  const [note, setNote] = useState('');
  const [pasteFor, setPasteFor] = useState<string | null>(null);
  const [updatePaste, setUpdatePaste] = useState('');
  const [qrFor, setQrFor] = useState<Challenge | null>(null);
  const [scanning, setScanning] = useState(false);

  const myName = cleanName(name, 'Me');

  const mine = (c: Challenge): ChallengeEntry => {
    const perDay = myDays(c.metric, c.start, c.end, steps, workouts);
    return { p: c.me, n: myName, total: sum(perDay), days: perDay, ts: Date.now() };
  };

  const create = () => {
    const c = newChallenge(title, metric, days);
    setChallenges((prev) => [c, ...prev].slice(0, 20));
    setTitle('');
    setNote(`Created “${c.title}”. Share the challenge code with your friends.`);
  };

  const join = (text: string = paste) => {
    const def = decodeChallenge(text);
    if (!def) {
      setNote('That does not look like a challenge code. Paste the whole code you were sent.');
      return;
    }
    if (challenges.some((c) => c.id === def.id)) {
      setNote('You are already in that challenge.');
      return;
    }
    setChallenges((prev) => [joinChallenge(def), ...prev].slice(0, 20));
    setPaste('');
    setNote(`Joined “${def.title}”. Send your friends an update when you want them to see your total.`);
  };

  const shareChallenge = async (c: Challenge) => {
    const r = await shareText('Join my challenge', `Join my Minimal Fitness challenge “${c.title}”. Open Minimal Fitness > You > Friends & challenges > Join, and paste this:\n\n${encodeChallenge(c)}`);
    setNote(r === 'copied' ? 'Challenge code copied. Paste it into a message.' : r === 'failed' ? 'Could not share. Select and copy the code instead.' : '');
  };

  const copyUpdate = async (c: Challenge) => {
    try {
      await navigator.clipboard.writeText(`KYFIT-UPDATE: ${c.title}\n${encodeUpdate(c.id, mine(c))}`);
      setNote('Your update is copied. Paste it into the group chat.');
    } catch {
      setNote('Could not copy. Use Send my update instead.');
    }
  };

  const copyStandings = async (c: Challenge, board: ReturnType<typeof leaderboard>, st: ReturnType<typeof challengeStatus>) => {
    const r = await shareText('Standings', standingsMessage(c, board, (v) => show(c.metric, v, units), st));
    setNote(r === 'copied' ? 'Standings copied. Paste them into the group chat.' : r === 'failed' ? 'Could not share the standings.' : '');
  };

  /** Reads whatever is on the clipboard: a challenge to join, or updates from friends, or both. */
  const fromClipboard = async (c?: Challenge) => {
    let text = '';
    try {
      text = isAndroidApp() ? (await ClipboardRead.read()).text : await navigator.clipboard.readText();
    } catch {
      setNote('Could not read the clipboard. Long-press in the box and paste instead.');
      return;
    }
    handleText(text, c);
  };

  const handleText = (text: string, c?: Challenge) => {
    const found = classifyPaste(text);
    if (found.challenge && !c) {
      join(text);
      return;
    }
    if (found.updates.length === 0) {
      setNote(found.challenge ? 'That is a challenge code. Use Join to add it.' : 'No codes found in that. Copy the whole message your friend sent.');
      return;
    }
    const target = c ?? challenges.find((x) => found.updates.some((u) => u.challengeId === x.id));
    if (!target) {
      setNote('Those updates are for a challenge you have not joined.');
      return;
    }
    const res = addUpdates(target, found.updates);
    setChallenges((prev) => prev.map((x) => (x.id === target.id ? res.challenge : x)));
    setUpdatePaste('');
    setPasteFor(null);
    setNote(res.added ? `Added ${res.added} update${res.added === 1 ? '' : 's'}: ${res.names.join(', ')}.${res.skipped ? ` ${res.skipped} could not be used.` : ''}` : res.skipped ? 'Those updates are for a different challenge or are out of date.' : 'Nothing new in those updates.');
  };

  const shareUpdate = async (c: Challenge) => {
    const r = await shareText('My challenge update', `My total in “${c.title}” so far. In Minimal Fitness open the challenge and choose Add a friend’s update, then paste this:\n\n${encodeUpdate(c.id, mine(c))}`);
    setNote(r === 'copied' ? 'Update copied. Paste it into a message.' : r === 'failed' ? 'Could not share. Try again.' : '');
  };

  const addFriend = (c: Challenge) => handleText(updatePaste, c);

  const remove = (c: Challenge) => setChallenges((prev) => prev.filter((x) => x.id !== c.id));

  const rows = useMemo(() => challenges.map((c) => ({ c, board: leaderboard(c, mine(c)), st: challengeStatus(c) })), [challenges, steps, workouts, myName]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] divide-y divide-[#1A1E26] overflow-hidden">
      <Row
        icon={<Trophy className="w-5 h-5 text-amber-300" aria-hidden="true" />}
        title="Friends and challenges"
        sub="Optional, and off until you turn it on. There are no accounts and no servers: a challenge is a short code you send to friends in any app you like, and they send an update code back. A code holds only a name you choose and a total for the measure, never your location or health details. Totals are not checked, so it is for friends."
        action={<Toggle on={prefs.challengesOn} onChange={(v) => setPrefs({ challengesOn: v })} label="Friends and challenges" />}
      />
      {prefs.challengesOn && (
        <>
          <div className="p-4 space-y-2">
            <label htmlFor="challenge-name" className="text-sm font-semibold text-white">
              Your display name
            </label>
            <input id="challenge-name" className={input} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="What your friends see" autoComplete="off" />
            <p className="text-xs text-[#9AA3B2]">Anyone you send an update to will see this name and your total.</p>
          </div>

          <div className="p-4 space-y-3">
            <h4 className="text-sm font-bold text-white">Start a challenge</h4>
            <div>
              <label htmlFor="challenge-title" className="text-xs text-[#9AA3B2]">
                Name
              </label>
              <input id="challenge-title" className={input} value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} placeholder="Weekend warriors" autoComplete="off" />
            </div>
            <fieldset>
              <legend className="text-xs text-[#9AA3B2]">What counts</legend>
              <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="What counts">
                {METRICS.map((m) => (
                  <button key={m.id} type="button" role="radio" aria-checked={metric === m.id} onClick={() => setMetric(m.id)} className="sport-pill !py-1.5 !px-3.5 !text-xs">
                    {m.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-xs text-[#9AA3B2]">How long</legend>
              <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="How long">
                {LENGTHS_DAYS.map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} className="sport-pill !py-1.5 !px-3.5 !text-xs">
                    {d} days
                  </button>
                ))}
              </div>
            </fieldset>
            <button type="button" onClick={create} className="min-h-11 rounded-xl px-4 text-sm font-bold flex items-center gap-1.5" style={{ backgroundColor: theme.primary, color: 'var(--on-accent, #14130F)' }}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Start it today
            </button>
          </div>

          <div className="p-4 space-y-2">
            <h4 className="text-sm font-bold text-white">Join a friend’s challenge</h4>
            <label htmlFor="challenge-join" className="text-xs text-[#9AA3B2]">
              Paste the challenge code
            </label>
            <textarea id="challenge-join" className={`${input} py-2`} rows={2} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="KYFIT-CHALLENGE-1:…" />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => join()} disabled={!paste.trim()} className={`${btn} disabled:opacity-40`}>
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Join
              </button>
              <button type="button" onClick={() => void fromClipboard()} className={btn}>
                <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
                Use what I copied
              </button>
              <button type="button" onClick={() => setScanning(true)} className={btn}>
                <ScanLine className="h-4 w-4" aria-hidden="true" />
                Scan a code
              </button>
            </div>
          </div>

          {note && (
            <p role="status" className="px-4 py-3 text-xs text-emerald-300">
              {note}
            </p>
          )}

          {scanning && (
            <QrScan
              onClose={() => setScanning(false)}
              onText={(t) => {
                setScanning(false);
                handleText(t);
              }}
            />
          )}
          {qrFor && <QrShow title={qrFor.title} text={encodeChallenge(qrFor)} onClose={() => setQrFor(null)} />}

          {rows.map(({ c, board, st }) => {
            const top = Math.max(1, ...board.map((r) => r.total));
            return (
              <section key={c.id} className="p-4 space-y-3" aria-label={c.title}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white truncate">{c.title}</h4>
                    <p className="text-xs text-[#9AA3B2]">
                      {METRICS.find((m) => m.id === c.metric)?.label} ·{' '}
                      {st.status === 'upcoming' ? `starts ${c.start}` : st.status === 'finished' ? 'finished' : `day ${st.day} of ${st.totalDays}, ${st.daysLeft} left`}
                    </p>
                  </div>
                  <button type="button" onClick={() => remove(c)} aria-label={`Leave and delete ${c.title}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-800 text-neutral-400 hover:text-white">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <ol className="space-y-1.5" aria-label={`Leaderboard for ${c.title}`}>
                  {board.map((r) => (
                    <li key={r.p} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className={r.me ? 'font-bold text-white' : 'text-neutral-200'}>
                          {r.rank}. {r.name}
                          {r.me ? ' (you)' : ''}
                        </span>
                        <span className="tabular-nums text-neutral-300">{show(c.metric, r.total, units)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                        <div className="h-full rounded-full" style={{ width: `${Math.round((r.total / top) * 100)}%`, backgroundColor: r.me ? theme.primary : '#8AB4F8' }} />
                      </div>
                    </li>
                  ))}
                </ol>
                {board.length === 1 && <p className="text-xs text-[#9AA3B2]">Only you so far. Share the challenge code, then add your friends’ updates here.</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => shareChallenge(c)} className={btn}>
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                    Invite
                  </button>
                  <button type="button" onClick={() => setQrFor(c)} className={btn}>
                    <QrCode className="h-4 w-4" aria-hidden="true" />
                    QR code
                  </button>
                  <button type="button" onClick={() => void copyUpdate(c)} className={btn}>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Copy my update
                  </button>
                  <button type="button" onClick={() => shareUpdate(c)} className={btn}>
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                    Send my update
                  </button>
                  {board.length > 1 && (
                    <button type="button" onClick={() => void copyStandings(c, board, st)} className={btn}>
                      <Trophy className="h-4 w-4" aria-hidden="true" />
                      Post standings
                    </button>
                  )}
                  <button type="button" onClick={() => setPasteFor(pasteFor === c.id ? null : c.id)} aria-expanded={pasteFor === c.id} className={btn}>
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    Add a friend’s update
                  </button>
                </div>
                {pasteFor === c.id && (
                  <div className="space-y-2">
                    <label htmlFor={`upd-${c.id}`} className="text-xs text-[#9AA3B2]">
                      Paste one update, or a whole chat with several
                    </label>
                    <textarea id={`upd-${c.id}`} className={`${input} py-2`} rows={2} value={updatePaste} onChange={(e) => setUpdatePaste(e.target.value)} placeholder="KYFIT-UPDATE-1:…" />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => addFriend(c)} disabled={!updatePaste.trim()} className={`${btn} disabled:opacity-40`}>
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Add
                      </button>
                      <button type="button" onClick={() => void fromClipboard(c)} className={btn}>
                        <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
                        Use what I copied
                      </button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
};
