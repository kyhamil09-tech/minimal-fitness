import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { LOGO_PRESETS, LOGO_STYLES, LogoStyle, logoShortcutPng } from '../lib/appLogo';
import { usePrefs } from '../lib/prefs';
import { Launch, isAndroidApp } from '../lib/native';
import { haptic } from '../lib/haptics';
import { AppLogo } from './AppLogo';

const isHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);

/** Look & feel > Logo: the shape and colors of the logo inside the app, and (on Android) the color of the home-screen icon. */
export const LogoSettings: React.FC = () => {
  const { prefs, setPrefs } = usePrefs();
  const [icon, setIcon] = useState<string>('forest');
  const [note, setNote] = useState('');
  const android = isAndroidApp();

  useEffect(() => {
    if (!android) return;
    void Launch.getLauncherIcon().then((r) => setIcon(r.id)).catch(() => undefined);
  }, [android]);

  const choosePreset = (bg: string, ink: string) => {
    haptic.select();
    setPrefs({ logoBg: bg, logoInk: ink });
  };
  const chooseIcon = async (id: string, bg: string, ink: string) => {
    haptic.select();
    setIcon(id);
    // The in-app logo follows the icon you pick, so the two match unless you then change it.
    setPrefs({ logoBg: bg, logoInk: ink });
    try {
      await Launch.setLauncherIcon({ id });
      setNote('Done. Your launcher may take a few seconds to show the new icon.');
    } catch {
      setNote('Could not change the home-screen icon on this phone.');
    }
  };

  const addShortcut = async () => {
    haptic.select();
    try {
      const png = logoShortcutPng(prefs.logoStyle, { bg: prefs.logoBg, ink: prefs.logoInk });
      const r = await Launch.addHomeShortcut({ png, label: 'Minimal Fitness' });
      setNote(!r.supported ? 'This launcher does not support adding shortcuts. Long-press the app icon, or use one of the ready-made colors.' : 'Confirm "Add to home screen" in the box Android shows.');
    } catch {
      setNote('Could not add the shortcut on this phone.');
    }
  };

  return (
    <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] overflow-hidden p-4 space-y-4">
      <div className="flex items-center gap-4">
        <AppLogo size={92} className="soft-float shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">Logo</div>
          <p className="text-xs text-[#9AA3B2] mt-0.5 leading-relaxed">Pick a shape and colors for the logo you see in the app.</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap" role="group" aria-label="Logo shape">
        {LOGO_STYLES.map((s) => (
          <button key={s.id} aria-pressed={prefs.logoStyle === s.id} onClick={() => setPrefs({ logoStyle: s.id as LogoStyle })} className="sport-pill !py-1.5 !px-3.5 !text-xs">
            {s.label}
          </button>
        ))}
      </div>

      <div>
        <div className="text-sm font-bold text-neutral-200 mb-2">Colors</div>
        <div className="grid grid-cols-4 gap-2">
          {LOGO_PRESETS.map((p) => {
            const on = prefs.logoBg.toLowerCase() === p.bg.toLowerCase() && prefs.logoInk.toLowerCase() === p.ink.toLowerCase();
            return (
              <button key={p.id} onClick={() => choosePreset(p.bg, p.ink)} aria-pressed={on} aria-label={p.name} className="relative rounded-2xl p-1.5 border text-center" style={{ borderColor: on ? 'var(--accent)' : 'var(--hairline)', boxShadow: on ? '0 0 0 1px var(--accent)' : 'none' }}>
                <AppLogo size={52} style={prefs.logoStyle} colors={{ bg: p.bg, ink: p.ink }} className="mx-auto" />
                <span className="block text-xs mt-1 text-neutral-300 truncate">{p.name}</span>
                {on && <Check className="absolute top-1 right-1 w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {[
            { label: 'Background', key: 'logoBg' as const },
            { label: 'Logo line', key: 'logoInk' as const },
          ].map((f) => (
            <label key={f.key} className="flex items-center gap-2 rounded-xl border px-2.5 py-2" style={{ borderColor: 'var(--hairline)' }}>
              <input type="color" value={prefs[f.key]} onChange={(e) => isHex(e.target.value) && setPrefs({ [f.key]: e.target.value } as never)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" aria-label={f.label} />
              <span className="text-xs text-neutral-300">{f.label}<span className="block font-mono text-xs text-neutral-400 uppercase">{prefs[f.key]}</span></span>
            </label>
          ))}
        </div>
        <button onClick={() => setPrefs({ logoStyle: 'ring', logoBg: LOGO_PRESETS[0].bg, logoInk: LOGO_PRESETS[0].ink })} className="mt-2 text-xs underline text-neutral-400">
          Reset the logo
        </button>
      </div>

      {android && (
        <div>
          <div className="text-sm font-bold text-neutral-200 mb-1">Home-screen icon</div>
          <p className="text-xs text-neutral-400 mb-2 leading-relaxed">Android only lets the real app icon be one of these ready-made colors. For any other color, add a shortcut below.</p>
          <div className="grid grid-cols-4 gap-2">
            {LOGO_PRESETS.map((p) => (
              <button key={p.id} onClick={() => void chooseIcon(p.id, p.bg, p.ink)} aria-pressed={icon === p.id} aria-label={`${p.name} icon`} className="relative rounded-2xl p-1.5 border" style={{ borderColor: icon === p.id ? 'var(--accent)' : 'var(--hairline)', boxShadow: icon === p.id ? '0 0 0 1px var(--accent)' : 'none' }}>
                <AppLogo size={52} style="ring" colors={{ bg: p.bg, ink: p.ink }} className="mx-auto" />
                {icon === p.id && <Check className="absolute top-1 right-1 w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />}
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
            <div className="flex items-center gap-3">
              <AppLogo size={44} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white">Use your own colors on the home screen</div>
                <p className="text-xs text-neutral-400 leading-relaxed">Adds a shortcut with your logo colors above. Android keeps the original icon too, so you can remove whichever you like.</p>
              </div>
            </div>
            <button onClick={() => void addShortcut()} className="mt-2.5 w-full py-2.5 rounded-full text-xs font-extrabold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
              Add a custom-color shortcut
            </button>
          </div>
          {note && <p role="status" className="text-xs text-neutral-400 mt-2">{note}</p>}
        </div>
      )}
    </div>
  );
};
