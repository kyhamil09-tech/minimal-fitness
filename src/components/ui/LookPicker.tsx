import React from 'react';
import { Check, Palette } from 'lucide-react';
import { Look, MODES, MiniApp, themesFor } from '../../lib/miniLook';
import { isHex, readableOn } from '../../lib/colorMath';

/**
 * Choose how Fasting or Eat looks: Dark, AMOLED black, Light or follow the phone, and a color theme (a preset, the main app's accent, or
 * your own color). `p` is the app's class prefix ('fa' or 'ea'), so it wears that app's own look.
 */
export const LookPicker: React.FC<{ app: MiniApp; p: 'fa' | 'ea'; look: Look; onChange: (l: Look) => void; appAccent: string }> = ({ app, p, look, onChange, appAccent }) => {
  const themes = themesFor(app);
  const set = (patch: Partial<Look>) => onChange({ ...look, ...patch });
  const swatch = (id: string, name: string, color: string) => (
    <button key={id} type="button" className={`${p}-chip !justify-start !gap-2.5`} aria-pressed={look.theme === id} onClick={() => set({ theme: id })} aria-label={`${name} theme`}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: color, border: '1px solid rgba(128,128,128,0.5)' }} aria-hidden="true">
        {look.theme === id && <Check className="h-3 w-3" style={{ color: isHex(color) ? readableOn(color, '#000000', '#ffffff') : '#fff' }} />}
      </span>
      <span className="truncate">{name}</span>
    </button>
  );
  return (
    <section className={`${p}-card`} aria-label="Look">
      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4" aria-hidden="true" />
        <h3 className="text-sm font-bold">Look</h3>
      </div>
      <p className={`${p}-dim mt-1 text-xs leading-relaxed`}>Pick a background and a color. It changes this app only.</p>

      <div className={`${p}-eyebrow mt-4`}>Background</div>
      <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Background">
        {MODES.map((m) => (
          <button key={m.id} type="button" className={`${p}-chip !h-auto !flex-col !items-start !gap-0 !rounded-2xl !py-2.5 text-left`} aria-pressed={look.mode === m.id} onClick={() => set({ mode: m.id })}>
            <span className="text-sm font-bold">{m.name}</span>
            <span className="text-[0.7rem] font-normal leading-tight">{m.line}</span>
          </button>
        ))}
      </div>

      <div className={`${p}-eyebrow mt-4`}>Color</div>
      <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Color theme">
        {themes.map((t) => swatch(t.id, t.name, t.accent))}
        {swatch('app', 'Match the app', appAccent)}
        {swatch('custom', 'Your own', look.custom)}
      </div>
      {look.theme === 'custom' && (
        <div className="mt-3 flex items-center gap-3">
          <label htmlFor={`${p}-custom-color`} className="text-sm font-semibold">
            Pick a color
          </label>
          <input
            id={`${p}-custom-color`}
            type="color"
            value={look.custom}
            onChange={(e) => set({ custom: e.target.value })}
            className="h-11 w-16 cursor-pointer rounded-lg border-0 bg-transparent p-0"
          />
          <span className={`${p}-dim text-xs tabular-nums`}>{look.custom.toUpperCase()}</span>
        </div>
      )}
      <button type="button" className={`${p}-chip mt-4`} onClick={() => onChange({ mode: 'dark', theme: themes[0].id, custom: themes[0].accent })}>
        Back to the original look
      </button>
    </section>
  );
};
