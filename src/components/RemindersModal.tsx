import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { ReminderSettings } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { Modal, fieldClass } from './ui/Modal';
import { notificationPermission, notify, requestNotificationPermission } from '../lib/notifications';

interface RemindersModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ColorPalette;
  settings: ReminderSettings;
  onChange: (s: ReminderSettings) => void;
}

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; color: string }> = ({
  checked,
  onChange,
  label,
  color,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className="w-10 h-6 rounded-full relative transition-colors shrink-0"
    style={{ backgroundColor: checked ? color : '#1F2430' }}
  >
    <span
      className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
      style={{ left: checked ? '1.15rem' : '0.125rem' }}
    />
  </button>
);

export const RemindersModal: React.FC<RemindersModalProps> = ({ isOpen, onClose, theme, settings, onChange }) => {
  const [perm, setPerm] = useState(notificationPermission());
  const set = (patch: Partial<ReminderSettings>) => onChange({ ...settings, ...patch });

  const enable = async () => {
    setPerm(await requestNotificationPermission());
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reminders"
      icon={<Bell className="w-4 h-4" style={{ color: theme.primary }} />}
    >
      <div className="space-y-4">
        {perm === 'unsupported' && (
          <p role="status" className="text-xs text-amber-300">
            This browser doesn't support notifications.
          </p>
        )}
        {perm === 'denied' && (
          <p role="status" className="text-xs text-amber-300">
            Notifications are blocked. Re-enable them in your browser's site settings.
          </p>
        )}
        {perm === 'default' && (
          <button onClick={enable} className="w-full py-2.5 rounded-xl text-xs font-bold text-black" style={{ backgroundColor: theme.primary }}>
            Allow notifications
          </button>
        )}
        {perm === 'granted' && (
          <button
            onClick={() => notify('Minimal Fitness', 'Notifications are working.', 'test')}
            className="text-[11px] underline text-neutral-400 hover:text-white"
          >
            Send a test notification
          </button>
        )}

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-white">Workout</div>
            <div className="text-[11px] text-[#7E889B]">Daily nudge at a set time</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              aria-label="Workout reminder time"
              type="time"
              value={settings.workoutTime}
              onChange={(e) => set({ workoutTime: e.target.value })}
              className={fieldClass + ' !w-28'}
            />
            <Toggle checked={settings.workoutEnabled} onChange={(v) => set({ workoutEnabled: v })} label="Workout reminder" color={theme.primary} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-white">Bedtime</div>
            <div className="text-[11px] text-[#7E889B]">Wind-down reminder</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              aria-label="Bedtime reminder time"
              type="time"
              value={settings.bedtimeTime}
              onChange={(e) => set({ bedtimeTime: e.target.value })}
              className={fieldClass + ' !w-28'}
            />
            <Toggle checked={settings.bedtimeEnabled} onChange={(v) => set({ bedtimeEnabled: v })} label="Bedtime reminder" color={theme.primary} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-white">Hydration</div>
            <div className="text-[11px] text-[#7E889B]">8am–9pm, only while below your goal</div>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Hydration reminder interval"
              value={settings.hydrationEveryMin}
              onChange={(e) => set({ hydrationEveryMin: parseInt(e.target.value, 10) })}
              className={fieldClass + ' !w-28'}
            >
              <option value={60}>Every 1 h</option>
              <option value={90}>Every 1.5 h</option>
              <option value={120}>Every 2 h</option>
              <option value={180}>Every 3 h</option>
            </select>
            <Toggle checked={settings.hydrationEnabled} onChange={(v) => set({ hydrationEnabled: v })} label="Hydration reminder" color={theme.primary} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-white">Fast complete</div>
            <div className="text-[11px] text-[#7E889B]">When you reach your fasting target</div>
          </div>
          <Toggle checked={settings.fastingEnabled} onChange={(v) => set({ fastingEnabled: v })} label="Fasting reminder" color={theme.primary} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-white">Fasting timer</div>
            <div className="text-[11px] text-[#7E889B]">A live timer in the notification shade while you fast (Android app)</div>
          </div>
          <Toggle checked={settings.fastingLive !== false} onChange={(v) => set({ fastingLive: v })} label="Fasting timer notification" color={theme.primary} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-white">Fasting stages</div>
            <div className="text-[11px] text-[#7E889B]">A short alert when your fast reaches a new stage (Android app)</div>
          </div>
          <Toggle checked={settings.fastingStages !== false} onChange={(v) => set({ fastingStages: v })} label="Fasting stage alerts" color={theme.primary} />
        </div>

        <p className="text-[11px] text-neutral-500 leading-relaxed border-t border-[#1A1E26] pt-3">
          Reminders are checked locally while Minimal Fitness is open or installed and running in the background. There is no
          server, so a fully closed app can't wake itself up to notify you.
        </p>
      </div>
    </Modal>
  );
};
