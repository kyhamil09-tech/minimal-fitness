import React from 'react';
import { CalendarCheck, Sparkles } from 'lucide-react';
import { usePrefs } from '../lib/prefs';
import { useT } from '../lib/i18n';
import { Choice, ChoiceRow, Row, Toggle } from './ui/SettingsParts';
import { ensureNotificationPermission } from '../lib/notifications';

/** Settings for the kind daily note and the weekly review notification. Everything is scheduled on the phone itself. */
export const CoachNotesSettings: React.FC = () => {
  const { prefs, setPrefs } = usePrefs();
  const t = useT();
  const days = [0, 1, 2, 3, 4, 5, 6].map((id) => ({ id, label: t(`coach.d${id}` as 'coach.d0') }));
  const turnOn = (patch: Parameters<typeof setPrefs>[0]) => {
    setPrefs(patch);
    void ensureNotificationPermission();
  };
  return (
    <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] divide-y divide-[#1A1E26] overflow-hidden">
      <Row
        icon={<Sparkles className="w-5 h-5 text-amber-300" aria-hidden="true" />}
        title={t('coach.daily.title')}
        sub={t('coach.daily.sub')}
        action={<Toggle on={prefs.coachDaily} onChange={(v) => (v ? turnOn({ coachDaily: true }) : setPrefs({ coachDaily: false }))} label={t('coach.daily.title')} />}
      />
      {prefs.coachDaily && (
        <div className="p-4 flex items-center justify-between gap-3">
          <label htmlFor="coach-daily-time" className="text-sm text-white">
            {t('coach.time')}
          </label>
          <input id="coach-daily-time" type="time" className="h-11 px-3 rounded-xl bg-black/40 border border-neutral-700 text-white" value={prefs.coachDailyTime} onChange={(e) => e.target.value && setPrefs({ coachDailyTime: e.target.value })} />
        </div>
      )}
      <Row
        icon={<CalendarCheck className="w-5 h-5 text-sky-300" aria-hidden="true" />}
        title={t('coach.weekly.title')}
        sub={t('coach.weekly.sub')}
        action={<Toggle on={prefs.coachWeekly} onChange={(v) => (v ? turnOn({ coachWeekly: true }) : setPrefs({ coachWeekly: false }))} label={t('coach.weekly.title')} />}
      />
      {prefs.coachWeekly && (
        <>
          <ChoiceRow title={t('coach.day')}>
            <Choice<number> label={t('coach.dayLabel')} value={prefs.coachWeeklyDay} onChange={(v) => setPrefs({ coachWeeklyDay: v })} options={days} />
          </ChoiceRow>
          <div className="p-4 flex items-center justify-between gap-3">
            <label htmlFor="coach-weekly-time" className="text-sm text-white">
              {t('coach.time')}
            </label>
            <input id="coach-weekly-time" type="time" className="h-11 px-3 rounded-xl bg-black/40 border border-neutral-700 text-white" value={prefs.coachWeeklyTime} onChange={(e) => e.target.value && setPrefs({ coachWeeklyTime: e.target.value })} />
          </div>
        </>
      )}
      <p className="p-4 text-xs text-[#9AA3B2] leading-relaxed">{t('coach.footer')}</p>
    </div>
  );
};
