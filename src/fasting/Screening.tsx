import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { GENERAL_NOTE, SCREEN_QUESTIONS } from './content';
import { FastPrefs, isBlocked } from './state';
import { FaHeader } from './ui';

/**
 * "Before you start": seven yes-or-no questions. A yes to the first three (under 18, pregnant or breastfeeding, an eating disorder or a
 * troubled relationship with food) switches starting a fast off. A yes to the others shows what to check with a doctor and asks you to
 * say you have read it. Nothing here is sent anywhere, and the answers can be changed later.
 */
export const Screening: React.FC<{ prefs: FastPrefs; onDone: (p: FastPrefs) => void; onBack: () => void }> = ({ prefs, onDone, onBack }) => {
  const [flags, setFlags] = useState<string[]>(prefs.flags);
  const [answered, setAnswered] = useState<Record<string, boolean>>(() => Object.fromEntries(SCREEN_QUESTIONS.map((q) => [q.id, prefs.screened])));
  const [step, setStep] = useState<'ask' | 'result'>('ask');
  const [read, setRead] = useState(false);
  const all = SCREEN_QUESTIONS.every((q) => answered[q.id]);
  const draft: FastPrefs = { ...prefs, flags, screened: true };
  const blocked = isBlocked(draft);
  const yes = SCREEN_QUESTIONS.filter((q) => flags.includes(q.id));

  const set = (id: string, v: boolean) => {
    setAnswered((a) => ({ ...a, [id]: true }));
    setFlags((f) => (v ? [...new Set([...f, id])] : f.filter((x) => x !== id)));
  };

  if (step === 'result') {
    return (
      <>
        <FaHeader title="Before you start" onBack={() => setStep('ask')} />
        <div className="fa-scroll">
          {blocked ? (
            <>
              <div className="fa-note mt-2">
                <div className="text-sm font-bold">Fasting is not a good fit right now</div>
                {yes.filter((q) => q.stop).map((q) => (
                  <p key={q.id} className="mt-2 text-sm leading-relaxed">
                    {q.advice}
                  </p>
                ))}
              </div>
              <p className="fa-dim mt-4 text-sm leading-relaxed">You can still read the guides here, but starting a fast is switched off. If you answered by mistake, go back and change it. If food or eating is hard for you at the moment, a doctor or an eating-disorder service can help, and it is a good thing to ask for.</p>
            </>
          ) : (
            <>
              <div className="mt-2 flex items-center gap-2">
                <ShieldCheck className="h-6 w-6" style={{ color: 'var(--fa-hue)' }} aria-hidden="true" />
                <h1 className="fa-h1">{yes.length ? 'Please check with a doctor' : 'You are set'}</h1>
              </div>
              {yes.length === 0 && <p className="fa-dim mt-2 text-sm leading-relaxed">None of those apply, so a daily fast of 12 to 18 hours is a reasonable thing to try. Longer fasts ask for an extra confirmation when you start them.</p>}
              {yes.map((q) => (
                <div key={q.id} className="fa-tip mt-3">
                  <div className="text-xs font-bold uppercase tracking-wider">{q.text}</div>
                  <p className="mt-1 text-sm leading-relaxed">{q.advice}</p>
                </div>
              ))}
              {yes.length > 0 && (
                <label className="mt-5 flex items-start gap-3 text-sm">
                  <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-1 h-5 w-5" />
                  <span>I have read this and will talk to my doctor before I fast.</span>
                </label>
              )}
            </>
          )}
          <p className="fa-dim mt-6 text-xs leading-relaxed">{GENERAL_NOTE}</p>
        </div>
        <div className="fa-footer">
          <button type="button" className="fa-btn w-full" disabled={!blocked && yes.length > 0 && !read} onClick={() => onDone(draft)}>
            {blocked ? 'Save my answers' : 'Continue'}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <FaHeader title="Before you start" onBack={onBack} />
      <div className="fa-scroll">
        <p className="fa-dim mt-1 text-sm leading-relaxed">Fasting is not right for everyone. Seven quick questions, answered only on this phone, so the app can tell you what to check first.</p>
        <ul className="mt-4 space-y-2.5">
          {SCREEN_QUESTIONS.map((q) => (
            <li key={q.id} className="fa-card">
              <div className="text-sm font-semibold leading-snug">{q.text}</div>
              <div className="mt-3 flex gap-2" role="group" aria-label={q.text}>
                <button type="button" className="fa-chip" aria-pressed={answered[q.id] && flags.includes(q.id)} onClick={() => set(q.id, true)}>
                  Yes
                </button>
                <button type="button" className="fa-chip" aria-pressed={answered[q.id] && !flags.includes(q.id)} onClick={() => set(q.id, false)}>
                  No
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="h-4" />
      </div>
      <div className="fa-footer">
        <button type="button" className="fa-btn w-full" disabled={!all} onClick={() => setStep('result')}>
          {all ? 'See what to know' : `Answer all ${SCREEN_QUESTIONS.length} to continue`}
        </button>
      </div>
    </>
  );
};
