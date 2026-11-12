import React, { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { BodyEntry, UserProfile } from '../types/tracking';
import { sortedBodyEntries } from '../lib/calc';
import { todayKey } from '../lib/dates';
import { cmToDisplay, displayToCm, displayToKg, kgToDisplay, lengthUnit, weightUnit } from '../lib/units';
import { Header, MiniLine, Stat } from './ui';
import { useT } from '../lib/i18n';
import type { MessageKey } from '../locales/en';

const FIELDS = [
  { key: 'bodyFatPct', label: 'lb.fat', unit: '%' },
  { key: 'waistCm', label: 'lb.waist', unit: 'len' },
  { key: 'chestCm', label: 'lb.chest', unit: 'len' },
  { key: 'hipsCm', label: 'lb.hips', unit: 'len' },
  { key: 'armCm', label: 'lb.arm', unit: 'len' },
] as const satisfies readonly { key: string; label: MessageKey; unit: string }[];

type FieldKey = (typeof FIELDS)[number]['key'];

const shortDate = (key: string): string => new Date(key + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

interface Props {
  profile: UserProfile;
  body: BodyEntry[];
  onAdd: (e: Omit<BodyEntry, 'id'>) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}

/**
 * Body measurements on the Lift side: weight, body fat and tape measurements, how they have changed, and a quick way to log them. It
 * is the same list as the main app's Progress screen (progress photos stay there), so both show the same entries.
 */
export const LiftBody: React.FC<Props> = ({ profile, body, onAdd, onDelete, onBack }) => {
  const units = profile.units;
  const t = useT();
  const uw = weightUnit(units);
  const ul = lengthUnit(units);
  const rows = useMemo(() => sortedBodyEntries(body), [body]);
  const latest = rows[rows.length - 1];
  const first = rows[0];
  /** The newest value of a measurement that was logged at all, and the oldest, so a day without body fat does not blank it. */
  const newest = (k: 'bodyFatPct' | 'waistCm') => [...rows].reverse().find((r) => r[k] !== undefined)?.[k];
  const oldest = (k: 'bodyFatPct' | 'waistCm') => rows.find((r) => r[k] !== undefined)?.[k];
  const [weight, setWeight] = useState('');
  const [other, setOther] = useState<Record<FieldKey, string>>({ bodyFatPct: '', waistCm: '', chestCm: '', hipsCm: '', armCm: '' });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const points = rows.slice(-60).map((r) => ({ label: shortDate(r.date), value: kgToDisplay(r.weightKg, units) }));
  const changeText = (now: number | undefined, then: number | undefined, conv: (v: number) => number, unit: string): string | undefined => {
    if (now === undefined || then === undefined) return undefined;
    const d = Math.round((conv(now) - conv(then)) * 10) / 10;
    return `${d > 0 ? '+' : ''}${d} ${unit}`;
  };

  const save = () => {
    const w = parseFloat(weight.replace(',', '.')) || (latest ? kgToDisplay(latest.weightKg, units) : 0);
    if (!(w > 0)) {
      setError(t('lb.enterWeight'));
      return;
    }
    const entry: Omit<BodyEntry, 'id'> = { date: todayKey(), weightKg: displayToKg(w, units) };
    for (const f of FIELDS) {
      const v = parseFloat(other[f.key].replace(',', '.'));
      if (!(v > 0)) continue;
      (entry as Record<string, unknown>)[f.key] = f.unit === 'len' ? displayToCm(v, units) : v;
    }
    onAdd(entry);
    setWeight('');
    setOther({ bodyFatPct: '', waistCm: '', chestCm: '', hipsCm: '', armCm: '' });
    setError('');
    setSaved(true);
  };

  return (
    <>
      <Header title={t('lb.title')} sub={latest ? t('lb.last', { date: shortDate(latest.date) }) : undefined} onBack={onBack} />
      <div className="l-scroll">
        {latest && (
          <div className="l-card mt-3 grid grid-cols-3 gap-2 p-4 text-center">
            <Stat label={t('lb.weight')} value={`${kgToDisplay(latest.weightKg, units)} ${uw}`} sub={first !== latest ? changeText(latest.weightKg, first.weightKg, (v) => kgToDisplay(v, units), uw) : undefined} />
            <Stat label={t('lb.fat')} value={newest('bodyFatPct') !== undefined ? `${newest('bodyFatPct')}%` : '–'} sub={changeText(newest('bodyFatPct'), oldest('bodyFatPct'), (v) => v, '%')} />
            <Stat label={t('lb.waist')} value={newest('waistCm') !== undefined ? `${cmToDisplay(newest('waistCm') as number, units)} ${ul}` : '–'} sub={changeText(newest('waistCm'), oldest('waistCm'), (v) => cmToDisplay(v, units), ul)} />
          </div>
        )}
        {latest && first !== latest && <p className="l-dim mt-1 text-center text-xs">{t('lb.since', { date: shortDate(first.date) })}</p>}

        <h2 className="l-h2">{t('lb.logToday')}</h2>
        <div className="l-card space-y-3 p-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold">{t('lb.weightUnit', { unit: uw })}</span>
            <input aria-label={t('lb.weightIn', { unit: uw })} inputMode="decimal" className="l-num-input !w-28" onFocus={(e) => e.target.select()} value={weight} placeholder={latest ? String(kgToDisplay(latest.weightKg, units)) : '0'} onChange={(e) => setWeight(e.target.value)} />
          </label>
          {FIELDS.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">
                {t(f.label)} ({f.unit === 'len' ? ul : f.unit})
              </span>
              <input
                aria-label={t('lb.fieldIn', { label: t(f.label), unit: f.unit === 'len' ? ul : f.unit })}
                inputMode="decimal"
                className="l-num-input !w-28"
                onFocus={(e) => e.target.select()}
                value={other[f.key]}
                placeholder={t('lb.optional')}
                onChange={(e) => setOther((o) => ({ ...o, [f.key]: e.target.value }))}
              />
            </label>
          ))}
          {error && (
            <p role="alert" className="text-sm" style={{ color: 'var(--l-fail)' }}>
              {error}
            </p>
          )}
          <button type="button" className="l-btn l-btn-primary w-full" onClick={save}>
            {t('common.save')}
          </button>
          {saved && (
            <p role="status" className="l-dim text-center text-xs">
              {t('lb.saved')}
            </p>
          )}
        </div>

        <h2 className="l-h2">{t('lb.overTime')}</h2>
        <div className="l-card p-4">
          <MiniLine points={points} unit={` ${uw}`} ariaLabel={t('lb.overTimeAria')} />
        </div>

        {rows.length > 0 && (
          <>
            <h2 className="l-h2">{t('lb.entries')}</h2>
            <ul className="l-card divide-y" style={{ borderColor: 'var(--l-line)' }}>
              {[...rows].reverse().slice(0, 40).map((r, i) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderTop: i > 0 ? '1px solid var(--l-line)' : 0 }}>
                  <span className="min-w-0 text-sm">
                    <span className="block font-semibold">
                      {shortDate(r.date)} · {kgToDisplay(r.weightKg, units)} {uw}
                    </span>
                    <span className="l-dim block truncate text-xs">
                      {[r.bodyFatPct !== undefined && t('lb.rowFat', { v: r.bodyFatPct }), r.waistCm !== undefined && t('lb.rowMeasure', { label: t('lb.waist').toLowerCase(), v: cmToDisplay(r.waistCm, units), u: ul }), r.chestCm !== undefined && t('lb.rowMeasure', { label: t('lb.chest').toLowerCase(), v: cmToDisplay(r.chestCm, units), u: ul }), r.hipsCm !== undefined && t('lb.rowMeasure', { label: t('lb.hips').toLowerCase(), v: cmToDisplay(r.hipsCm, units), u: ul }), r.armCm !== undefined && t('lb.rowMeasure', { label: t('lb.arm').toLowerCase(), v: cmToDisplay(r.armCm, units), u: ul })].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <button type="button" className="l-icon-btn -mr-2" onClick={() => onDelete(r.id)} aria-label={t('lb.deleteEntry', { date: shortDate(r.date) })}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="l-dim mt-4 text-xs">{t('lb.photos')}</p>
        <div className="h-8" />
      </div>
    </>
  );
};
