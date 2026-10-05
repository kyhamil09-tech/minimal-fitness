import React, { useState } from 'react';
import { HeartPulse, Droplet, Pill, Stethoscope, Trash2 } from 'lucide-react';
import { HealthLogEntry } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { GlucoseRelation, Tone, classifyBp, classifyGlucose, mgdlToMmol, recentNames } from '../lib/healthLog';

interface HealthLogScreenProps {
  theme: ColorPalette;
  entries: HealthLogEntry[];
  onAdd: (entry: Omit<HealthLogEntry, 'id'>) => void;
  onDelete: (id: string) => void;
}

const TONE_COLOR: Record<Tone, string> = { good: '#4ade80', watch: '#ffd23f', high: '#ff4d4d', low: '#7dd3fc' };

const RELATIONS: { id: GlucoseRelation; label: string }[] = [
  { id: 'fasting', label: 'Fasting' },
  { id: 'before', label: 'Before meal' },
  { id: 'after', label: 'After meal' },
  { id: 'general', label: 'Other' },
];

const field = 'w-full px-3 py-2.5 text-sm text-white';

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Blood pressure, glucose, medications and symptoms. Readings are a log for you and your doctor, not a diagnosis. */
export const HealthLogScreen: React.FC<HealthLogScreenProps> = ({ theme, entries, onAdd, onDelete }) => {
  const [sys, setSys] = useState('');
  const [dia, setDia] = useState('');
  const [pulse, setPulse] = useState('');
  const [glucose, setGlucose] = useState('');
  const [relation, setRelation] = useState<GlucoseRelation>('fasting');
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [symName, setSymName] = useState('');
  const [severity, setSeverity] = useState(2);
  const [note, setNote] = useState('');
  const [shown, setShown] = useState(20);

  const sorted = [...entries].sort((a, b) => b.at - a.at);
  const now = () => Date.now();

  const saveBp = () => {
    const s = Math.round(Number(sys));
    const d = Math.round(Number(dia));
    if (!(s >= 60 && s <= 260 && d >= 30 && d <= 160 && s > d)) return;
    onAdd({ kind: 'bp', at: now(), systolic: s, diastolic: d, pulse: Number(pulse) > 0 ? Math.round(Number(pulse)) : undefined });
    setSys('');
    setDia('');
    setPulse('');
  };
  const saveGlucose = () => {
    const v = Number(glucose);
    if (!(v >= 20 && v <= 700)) return;
    onAdd({ kind: 'glucose', at: now(), mgdl: Math.round(v), relation });
    setGlucose('');
  };
  const saveMed = (name = medName, dose = medDose) => {
    if (!name.trim()) return;
    onAdd({ kind: 'med', at: now(), name: name.trim(), dose: dose.trim() || undefined });
    setMedName('');
    setMedDose('');
  };
  const saveSymptom = (name = symName) => {
    if (!name.trim()) return;
    onAdd({ kind: 'symptom', at: now(), name: name.trim(), severity, note: note.trim() || undefined });
    setSymName('');
    setNote('');
  };

  const bpOk = Number(sys) > Number(dia) && Number(sys) >= 60 && Number(dia) >= 30;
  const preview = bpOk ? classifyBp(Number(sys), Number(dia)) : null;
  const meds = recentNames(entries, 'med');
  const symptoms = recentNames(entries, 'symptom');

  const card = 'rounded-[28px] border p-5 space-y-3';
  const cardStyle = { backgroundColor: theme.surface, borderColor: theme.surfaceBorder };
  const saveBtn = 'w-full py-3 rounded-full text-sm font-extrabold disabled:opacity-40';

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <section className={card} style={cardStyle}>
        <div className="flex items-center gap-2">
          <HeartPulse className="w-4 h-4 text-rose-400" />
          <span className="stat-label">Blood pressure</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input aria-label="Systolic" inputMode="numeric" placeholder="Top" value={sys} onChange={(e) => setSys(e.target.value)} className={field} />
          <input aria-label="Diastolic" inputMode="numeric" placeholder="Bottom" value={dia} onChange={(e) => setDia(e.target.value)} className={field} />
          <input aria-label="Pulse" inputMode="numeric" placeholder="Pulse" value={pulse} onChange={(e) => setPulse(e.target.value)} className={field} />
        </div>
        {preview && (
          <p className="text-xs font-semibold" style={{ color: TONE_COLOR[preview.tone] }}>
            {preview.label}
          </p>
        )}
        <button onClick={saveBp} disabled={!bpOk} className={saveBtn} style={{ backgroundColor: theme.primary, color: '#000' }}>
          Save reading
        </button>
      </section>

      <section className={card} style={cardStyle}>
        <div className="flex items-center gap-2">
          <Droplet className="w-4 h-4 text-sky-300" />
          <span className="stat-label">Blood glucose</span>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="When was it taken">
          {RELATIONS.map((r) => (
            <button key={r.id} onClick={() => setRelation(r.id)} aria-pressed={relation === r.id} className="sport-pill !py-2 !text-xs">
              {r.label}
            </button>
          ))}
        </div>
        <input aria-label="Glucose in mg/dL" inputMode="decimal" placeholder="mg/dL" value={glucose} onChange={(e) => setGlucose(e.target.value)} className={field} />
        {Number(glucose) >= 20 && (
          <p className="text-xs font-semibold" style={{ color: TONE_COLOR[classifyGlucose(Number(glucose), relation).tone] }}>
            {classifyGlucose(Number(glucose), relation).label} · {mgdlToMmol(Number(glucose))} mmol/L
          </p>
        )}
        <button onClick={saveGlucose} disabled={!(Number(glucose) >= 20)} className={saveBtn} style={{ backgroundColor: theme.primary, color: '#000' }}>
          Save reading
        </button>
      </section>

      <section className={card} style={cardStyle}>
        <div className="flex items-center gap-2">
          <Pill className="w-4 h-4 text-violet-300" />
          <span className="stat-label">Medication and supplements</span>
        </div>
        {meds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {meds.map((m) => (
              <button
                key={m}
                onClick={() => saveMed(m, entries.find((e) => e.kind === 'med' && e.name === m)?.dose ?? '')}
                className="sport-pill !py-1.5 !text-xs"
                aria-label={`Log ${m} taken now`}
              >
                + {m}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input aria-label="Medication name" placeholder="Name" value={medName} onChange={(e) => setMedName(e.target.value)} className={field} />
          <input aria-label="Dose" placeholder="Dose, e.g. 500 mg" value={medDose} onChange={(e) => setMedDose(e.target.value)} className={field} />
        </div>
        <button onClick={() => saveMed()} disabled={!medName.trim()} className={saveBtn} style={{ backgroundColor: theme.primary, color: '#000' }}>
          Log as taken now
        </button>
      </section>

      <section className={card} style={cardStyle}>
        <div className="flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-amber-300" />
          <span className="stat-label">Symptoms</span>
        </div>
        {symptoms.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {symptoms.map((s) => (
              <button key={s} onClick={() => setSymName(s)} className="sport-pill !py-1.5 !text-xs">
                {s}
              </button>
            ))}
          </div>
        )}
        <input aria-label="Symptom" placeholder="What are you feeling? e.g. headache" value={symName} onChange={(e) => setSymName(e.target.value)} className={field} />
        <div>
          <span className="stat-label">How strong</span>
          <div className="flex gap-2 mt-1.5" role="group" aria-label="Severity">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setSeverity(n)} aria-pressed={severity === n} className="sport-pill !py-2 !px-4 !text-xs">
                {n}
              </button>
            ))}
          </div>
        </div>
        <input aria-label="Note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className={field} />
        <button onClick={() => saveSymptom()} disabled={!symName.trim()} className={saveBtn} style={{ backgroundColor: theme.primary, color: '#000' }}>
          Save symptom
        </button>
      </section>

      <section className="space-y-2">
        <div className="px-1 stat-label">History · {sorted.length}</div>
        {sorted.length === 0 && <p className="text-center text-xs text-[#7E889B] py-6">Nothing logged yet. Readings you save above show up here.</p>}
        <ul className="space-y-2">
          {sorted.slice(0, shown).map((e) => {
            const reading =
              e.kind === 'bp' && e.systolic && e.diastolic
                ? classifyBp(e.systolic, e.diastolic)
                : e.kind === 'glucose' && e.mgdl
                  ? classifyGlucose(e.mgdl, e.relation ?? 'general')
                  : null;
            const title =
              e.kind === 'bp'
                ? `${e.systolic}/${e.diastolic} mmHg${e.pulse ? ` · ${e.pulse} bpm` : ''}`
                : e.kind === 'glucose'
                  ? `${e.mgdl} mg/dL · ${RELATIONS.find((r) => r.id === e.relation)?.label ?? 'Other'}`
                  : e.kind === 'med'
                    ? `${e.name}${e.dose ? ` · ${e.dose}` : ''}`
                    : `${e.name} · strength ${e.severity ?? '-'}/5`;
            return (
              <li key={e.id} className="rounded-2xl border px-4 py-3 flex items-center justify-between gap-3" style={cardStyle}>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{title}</div>
                  <div className="text-[11px] text-neutral-500">
                    {when(e.at)}
                    {e.imported ? ' · Health Connect' : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                  {reading && (
                    <div className="text-[11px] font-semibold mt-0.5" style={{ color: TONE_COLOR[reading.tone] }}>
                      {reading.label}
                    </div>
                  )}
                </div>
                <button onClick={() => onDelete(e.id)} aria-label="Delete entry" className="text-neutral-600 hover:text-rose-400 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
        {sorted.length > shown && (
          <button onClick={() => setShown(shown + 30)} className="w-full py-2 text-xs font-bold text-neutral-400 hover:text-white">
            Show more
          </button>
        )}
      </section>

      <p className="text-[10px] text-neutral-600 text-center px-4 leading-relaxed">
        This is a personal log, not medical advice. The labels are general guides for adults. Talk to your doctor about your own targets.
        If you feel unwell, get medical help.
      </p>
    </div>
  );
};
