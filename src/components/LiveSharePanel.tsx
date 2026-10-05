import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { Choice, ChoiceRow, Row, Toggle } from './ui/SettingsParts';
import { fieldClass } from './ui/Modal';
import {
  KIND_LABEL,
  MAX_CONTACTS,
  ShareLogEntry,
  clearShareLog,
  liveShareSupported,
  normalizePhone,
  readShareLog,
  requestSms,
  sendTestText,
  smsStatus,
  useLiveShare,
} from '../lib/liveShare';

const clock = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Settings for the safety live share: who gets a text with a map link while you run, ride or walk, and a log of every text sent. */
export const LiveSharePanel: React.FC<{ theme: ColorPalette }> = () => {
  const [cfg, update] = useLiveShare();
  const [status, setStatus] = useState<{ canText: boolean; granted: boolean } | null>(null);
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [message, setMessage] = useState('');
  const [log, setLog] = useState<ShareLogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const supported = liveShareSupported();

  const refresh = useCallback(() => {
    void smsStatus().then(setStatus);
    void readShareLog().then(setLog);
  }, []);
  useEffect(refresh, [refresh]);

  if (!supported) {
    return <p className="px-2 text-xs text-[#7E889B]">Live share texts a map link from your Android phone, so it is only in the Android app.</p>;
  }

  const switchOn = async (on: boolean) => {
    setMessage('');
    if (!on) return update({ enabled: false });
    if (cfg.contacts.length === 0) return setMessage('Add at least one contact first.');
    if (!status?.canText) return setMessage('This phone cannot send text messages.');
    const ok = status.granted || (await requestSms());
    refresh();
    if (!ok) return setMessage('Android did not allow text messages. You can allow SMS for Minimal Fitness in Android settings.');
    update({ enabled: true });
  };

  const addContact = () => {
    const n = normalizePhone(number);
    if (!n) return setMessage('That does not look like a phone number.');
    if (cfg.contacts.length >= MAX_CONTACTS) return setMessage(`You can add up to ${MAX_CONTACTS} people.`);
    if (cfg.contacts.some((c) => c.number === n)) return setMessage('That number is already added.');
    update({ contacts: [...cfg.contacts, { name: name.trim().slice(0, 30) || n, number: n }] });
    setName('');
    setNumber('');
    setMessage('');
  };

  return (
    <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] divide-y divide-[#1A1E26] overflow-hidden">
      <Row
        icon={<MessageSquare className="w-5 h-5 text-emerald-300" />}
        title="Text my location during workouts"
        sub="On a run, walk, hike or ride, texts the people below a map link when you start, every few minutes, and when you finish. It goes by SMS from this phone: no internet, no server, no account."
        action={<Toggle on={cfg.enabled} onChange={(v) => void switchOn(v)} label="Text my location during workouts" />}
      />
      <div className="p-4 space-y-3">
        <div className="text-sm font-semibold text-white">People who get the texts</div>
        {cfg.contacts.length === 0 && <p className="text-xs text-[#7E889B]">No one yet. Add up to {MAX_CONTACTS}.</p>}
        {cfg.contacts.map((c) => (
          <div key={c.number} className="flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <div className="text-white truncate">{c.name}</div>
              <div className="font-mono text-neutral-500">{c.number}</div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                disabled={!status?.granted}
                onClick={async () => {
                  const ok = await sendTestText(cfg, c);
                  setMessage(ok ? `Test text sent to ${c.name}.` : 'Could not send the test text.');
                  refresh();
                }}
                className="text-[11px] font-bold underline text-neutral-300 disabled:opacity-40"
              >
                Send test
              </button>
              <button aria-label={`Remove ${c.name}`} onClick={() => update({ contacts: cfg.contacts.filter((x) => x.number !== c.number) })} className="text-neutral-500 hover:text-rose-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {cfg.contacts.length < MAX_CONTACTS && (
          <div className="space-y-2">
            <input aria-label="Contact name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Alex)" className={fieldClass} />
            <div className="flex gap-2">
              <input aria-label="Contact phone number" inputMode="tel" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Phone number" className={fieldClass} />
              <button onClick={addContact} className="px-4 rounded-xl border border-neutral-700 text-xs font-semibold text-white">Add</button>
            </div>
          </div>
        )}
        {message && <p role="status" className="text-[11px] text-amber-300">{message}</p>}
      </div>
      <ChoiceRow title="Your name in the texts" sub="So they know who it is, for example “Sam started a run”.">
        <input aria-label="Your name" value={cfg.yourName} onChange={(e) => update({ yourName: e.target.value })} placeholder="Your first name" className={fieldClass} maxLength={24} />
      </ChoiceRow>
      <ChoiceRow title="Update every" sub="Minutes between location texts. Each one is a text that your carrier may charge for.">
        <Choice label="Minutes between updates" value={cfg.everyMin} onChange={(v) => update({ everyMin: v })} options={[5, 10, 15, 30].map((v) => ({ id: v as 5 | 10 | 15 | 30, label: `${v} min` }))} />
      </ChoiceRow>
      <Row
        icon={<MessageSquare className="w-5 h-5 text-amber-300" />}
        title="Tell them if I stop moving"
        sub="One text if you stay in the same place for 5 minutes (not while paused), so someone can check on you."
        action={<Toggle on={cfg.stillAlert} onChange={(v) => update({ stillAlert: v })} label="Text if I stop moving" />}
      />
      <div className="p-4 space-y-2 text-[11px] leading-relaxed text-neutral-400">
        <p><span className="font-semibold text-neutral-200">What is sent: </span>your name, the activity, time and distance so far, your battery level, and a Google Maps link to your position. The link is only an address: this app does not contact Google or anyone else. The person you text opens it on their own phone.</p>
        <p><span className="font-semibold text-neutral-200">Who can see it: </span>whoever receives the texts, and your phone company, as with any text. The texts also show up in your phone’s own messages app.</p>
        <p><span className="font-semibold text-neutral-200">You stay in control: </span>it is off until you switch it on, you can turn it off for a single run on the start screen, and the SOS button on a live run texts them straight away.</p>
        <p><span className="font-semibold text-neutral-200">Needs: </span>a mobile signal. With none, a text can fail, and the list below shows it. The contacts’ numbers are kept in this app and in any backup you make.</p>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Texts this app has sent</div>
          <button onClick={() => { refresh(); setShowLog((v) => !v); }} className="text-[11px] font-bold text-neutral-300">{showLog ? 'Hide' : `Show ${log.length}`}</button>
        </div>
        {showLog && (
          <>
            {log.length === 0 ? (
              <p className="text-xs text-[#7E889B] mt-2">Nothing sent yet.</p>
            ) : (
              <ul className="mt-2 max-h-56 overflow-y-auto divide-y divide-[#1A1E26]">
                {[...log].reverse().map((e, i) => (
                  <li key={`${e.t}-${i}`} className="py-1.5 text-[11px] flex justify-between gap-2">
                    <span className="text-neutral-300">{KIND_LABEL[e.kind] ?? e.kind} to <span className="font-mono">{e.to}</span></span>
                    <span className={e.ok ? 'text-neutral-500' : 'text-rose-300'}>{e.ok ? clock(e.t) : `failed${e.err ? `: ${e.err}` : ''}`}</span>
                  </li>
                ))}
              </ul>
            )}
            {log.length > 0 && <button onClick={() => void clearShareLog().then(refresh)} className="mt-2 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-semibold text-neutral-200">Clear the list</button>}
          </>
        )}
      </div>
    </div>
  );
};
