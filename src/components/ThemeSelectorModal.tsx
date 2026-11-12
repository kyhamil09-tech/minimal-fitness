import React, { useState } from 'react';
import { X, Palette, Check, Plus, Trash2, Sparkles, Sliders, Sun, Moon, SunMoon } from 'lucide-react';
import { ThemeId, ColorPalette } from '../types/theme';
import { MODERN_THEMES, SPECIAL_THEME_IDS, generateCustomPalette } from '../data/themes';
import { Backdrop, DARK_BACKDROPS, LIGHT_BACKDROPS, makeBackdrop } from '../data/backdrops';
import { VIBES } from '../data/vibes';
import { AppearanceApi } from '../hooks/useAppearance';
import { lightPre } from '../lib/colorMath';
import { buzz, usePrefs } from '../lib/prefs';
import { Segmented } from './ui/Segmented';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentThemeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  customThemes?: Record<string, ColorPalette>;
  onSaveCustomTheme?: (palette: ColorPalette) => void;
  onDeleteCustomTheme?: (id: string) => void;
  look: AppearanceApi;
}

const PRESET_SWATCHES = [
  '#8FB287', '#C8F135', '#D9784F', '#E58F79', '#D9A5A8', '#B8A9D9', '#7FA8C9', '#D9B66F',
  '#05F196', '#00E5FF', '#FFD600', '#FF6E40', '#FF1744', '#FF007F', '#A855F7', '#F1F5F9',
];

const MODES: { id: 'dark' | 'light' | 'auto'; label: string; icon: React.ReactNode }[] = [
  { id: 'dark', label: 'Dark', icon: <Moon className="w-3.5 h-3.5" /> },
  { id: 'light', label: 'Light', icon: <Sun className="w-3.5 h-3.5" /> },
  { id: 'auto', label: 'Auto', icon: <SunMoon className="w-3.5 h-3.5" /> },
];

type Tab = 'backgrounds' | 'palettes' | 'create';

export const ThemeSelectorModal: React.FC<ThemeSelectorModalProps> = ({
  isOpen,
  onClose,
  currentThemeId,
  onSelectTheme,
  customThemes = {},
  onSaveCustomTheme,
  onDeleteCustomTheme,
  look,
}) => {
  const { setPrefs } = usePrefs();
  const [tab, setTab] = useState<Tab>('backgrounds');
  const [bgName, setBgName] = useState('My background');
  const [bgColor, setBgColor] = useState('#1E2A3A');
  const [customName, setCustomName] = useState('My palette');
  const [primaryColor, setPrimaryColor] = useState('#8FB287');
  const [secondaryColor, setSecondaryColor] = useState('#D9784F');
  const [tertiaryColor, setTertiaryColor] = useState('#E58F79');

  if (!isOpen) return null;

  // The page is inverted by a filter in the light family, so swatches drawn inside it are converted to show their true color.
  const shown = (c: string) => (look.light ? lightPre(c) : c);
  const tap = () => buzz(true, 12);

  const pickBackdrop = (id: string) => {
    tap();
    look.select(id);
  };
  const applyVibe = (v: (typeof VIBES)[number]) => {
    tap();
    onSelectTheme(v.paletteId);
    look.select(v.light);
    look.select(v.dark);
    look.setMode(v.mode);
  };

  /** Choosing a palette. A special theme also sets what goes with it: its background, light or dark, and the ambient glow. */
  const choosePalette = (t: ColorPalette) => {
    tap();
    onSelectTheme(t.id as ThemeId);
    const p = t.preset;
    if (!p) return;
    if (p.light) look.select(p.light);
    if (p.dark) look.select(p.dark);
    look.setMode(p.mode);
    if (p.glow) setPrefs({ glow: p.glow });
  };

  const handleSaveCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;
    const id = `custom_${Date.now()}`;
    onSaveCustomTheme?.(generateCustomPalette(id, customName.trim(), primaryColor, secondaryColor, tertiaryColor));
    onSelectTheme(id);
    setTab('palettes');
  };

  const BackdropTile: React.FC<{ b: Backdrop; removable?: boolean }> = ({ b, removable }) => {
    const on = look.backdropId === b.id;
    return (
      <div className="relative">
        <button
          onClick={() => pickBackdrop(b.id)}
          aria-pressed={on}
          className="w-full rounded-2xl border p-2 text-left transition-transform active:scale-[0.97]"
          style={{ backgroundColor: shown(b.bg), borderColor: on ? 'var(--accent)' : shown(b.hairline), boxShadow: on ? '0 0 0 1px var(--accent)' : 'none' }}
        >
          <div className="rounded-xl p-2 space-y-1.5" style={{ backgroundColor: shown(b.card), border: `1px solid ${shown(b.hairline)}` }}>
            <div className="h-1.5 w-2/3 rounded-full" style={{ backgroundColor: shown(b.ink) }} />
            <div className="h-1.5 w-1/2 rounded-full" style={{ backgroundColor: shown(b.inkDim) }} />
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-1">
            <span className="text-xs font-semibold truncate" style={{ color: shown(b.ink) }}>{b.name}</span>
            {on && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />}
          </div>
        </button>
        {removable && (
          <button aria-label={`Delete ${b.name}`} onClick={() => look.removeCustom(b.id)} className="absolute top-1 right-1 p-1 rounded-full bg-black/40 text-neutral-300">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  const PaletteCard: React.FC<{ theme: ColorPalette; custom?: boolean }> = ({ theme, custom }) => {
    const on = currentThemeId === theme.id;
    return (
      <div
        onClick={() => choosePalette(theme)}
        className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${on ? 'border-white/60 bg-white/5' : 'border-[#1A1E26] bg-black/40 hover:border-neutral-700'}`}
      >
        <div className="flex items-start justify-between gap-1">
          <div>
            <div className="text-xs font-semibold text-white">{theme.name}</div>
            <div className="text-xs text-[#9AA3B2] line-clamp-1 mt-0.5">{theme.tagline}</div>
          </div>
          {on && (
            <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--accent)', color: 'var(--color-black)' }}>
              <Check className="w-2.5 h-2.5 stroke-[3]" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-white/5">
          <div className="flex items-center gap-1.5">
            {[theme.primary, theme.secondary, theme.tertiary, ...(theme.data ? [theme.data.blue, theme.data.yellow, theme.data.purple] : [])].map((c, i) => (
              <span key={i} className={i === 0 ? 'w-4 h-4 rounded-full' : 'w-3 h-3 rounded-full'} style={{ backgroundColor: shown(c), border: '1px solid rgba(0,0,0,0.25)' }} />
            ))}
          </div>
          {custom && onDeleteCustomTheme && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteCustomTheme(theme.id);
              }}
              className="p-1 text-neutral-400 hover:text-red-400"
              aria-label={`Delete ${theme.name}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const swatchRow = (label: string, value: string, set: (v: string) => void) => (
    <div className="p-3 rounded-2xl bg-black/30 border border-[#1A1E26] space-y-2">
      <div className="text-xs font-medium text-neutral-300">{label}</div>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => set(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" aria-label={label} />
        <input
          type="text"
          value={value}
          onChange={(e) => set(e.target.value)}
          className="w-full px-2 py-1 rounded-lg bg-black/40 border border-[#222836] text-xs font-mono text-white uppercase text-center"
          maxLength={7}
        />
      </div>
    </div>
  );

  const previewBackdrop = makeBackdrop('preview', bgName, /^#[0-9a-f]{6}$/i.test(bgColor) ? bgColor : '#1E2A3A');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div role="dialog" aria-modal="true" aria-label="Look and colors" className="relative w-full max-w-lg max-h-[90vh] bg-[#0B0D11] border border-[#1A1E26] rounded-3xl p-5 sm:p-6 text-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between pb-3 border-b border-[#1A1E26] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl border border-neutral-800 flex items-center justify-center" style={{ backgroundColor: 'var(--accent-soft)' }}>
              <Palette className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Look & colors</h3>
              <p className="text-xs text-[#9AA3B2]">Pick a background and a palette, or make your own</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full text-neutral-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dark, light or follow the phone */}
        <Segmented<(typeof MODES)[number]['id']>
          className="mt-3 shrink-0"
          ariaLabel="Appearance"
          size="sm"
          semantics="radio"
          value={look.mode}
          onChange={(id) => {
            tap();
            look.setMode(id);
          }}
          options={MODES.map((m) => ({ id: m.id, label: m.label, icon: m.icon }))}
        />

        <div className="flex items-center gap-1 mt-2 shrink-0">
          {([['backgrounds', 'Backgrounds'], ['palettes', 'Palettes'], ['create', 'Create']] as [Tab, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id} className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold ${tab === id ? 'bg-white/10 text-white' : 'text-neutral-400'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar py-3 space-y-4">
          {tab === 'backgrounds' && (
            <>
              <div>
                <div className="text-sm font-bold text-neutral-200 px-1 mb-2">Starting looks</div>
                <div className="grid grid-cols-2 gap-2">
                  {VIBES.map((v) => (
                    <button key={v.id} onClick={() => applyVibe(v)} className="rounded-2xl border border-[#1A1E26] p-2.5 text-left active:scale-[0.97] transition-transform bg-black/30">
                      <div className="flex gap-1 mb-1.5">
                        {v.swatch.map((c, i) => (
                          <span key={i} className="h-4 flex-1 rounded-md" style={{ backgroundColor: shown(c) }} />
                        ))}
                      </div>
                      <div className="text-xs font-semibold text-white">{v.name}</div>
                      <div className="text-xs text-[#9AA3B2] leading-snug">{v.tagline}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-bold text-neutral-200 px-1 mb-2">Dark</div>
                <div className="grid grid-cols-3 gap-2">
                  {DARK_BACKDROPS.map((b) => (
                    <BackdropTile key={b.id} b={b} />
                  ))}
                  {Object.values(look.custom).filter((b) => b.family === 'dark').map((b) => (
                    <BackdropTile key={b.id} b={b} removable />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-bold text-neutral-200 px-1 mb-2">Light and pastel</div>
                <div className="grid grid-cols-3 gap-2">
                  {LIGHT_BACKDROPS.map((b) => (
                    <BackdropTile key={b.id} b={b} />
                  ))}
                  {Object.values(look.custom).filter((b) => b.family === 'light').map((b) => (
                    <BackdropTile key={b.id} b={b} removable />
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-black/30 border border-[#1A1E26] space-y-2.5">
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} /> Your own background
                </div>
                <div className="flex items-center gap-2">
                  <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-9 h-9 rounded cursor-pointer border-0 bg-transparent" aria-label="Background color" />
                  <input value={bgColor} onChange={(e) => setBgColor(e.target.value)} maxLength={7} className="w-24 px-2 py-1.5 rounded-lg bg-black/40 border border-[#222836] text-xs font-mono text-white uppercase text-center" aria-label="Background hex" />
                  <input value={bgName} onChange={(e) => setBgName(e.target.value)} maxLength={24} className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-black/40 border border-[#222836] text-xs text-white" aria-label="Background name" />
                </div>
                <div className="rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: shown(previewBackdrop.bg) }}>
                  <div className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ backgroundColor: shown(previewBackdrop.card), color: shown(previewBackdrop.ink), border: `1px solid ${shown(previewBackdrop.hairline)}` }}>
                    Preview card
                  </div>
                  <span className="text-xs" style={{ color: shown(previewBackdrop.inkDim) }}>{previewBackdrop.family === 'light' ? 'Light family' : 'Dark family'}</span>
                </div>
                <button
                  onClick={() => {
                    tap();
                    look.saveCustom(bgName, previewBackdrop.bg);
                  }}
                  className="w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--color-black)' }}
                >
                  <Plus className="w-3.5 h-3.5" /> Save and use
                </button>
              </div>
            </>
          )}

          {tab === 'palettes' && (
            <div className="space-y-3">
              {Object.keys(customThemes).length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider px-1 flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                    <Sparkles className="w-3 h-3" /> Your palettes
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.values(customThemes).map((t) => (
                      <PaletteCard key={t.id} theme={t} custom />
                    ))}
                  </div>
                </div>
              )}
              <div className="text-sm font-bold text-neutral-200 px-1">Special themes</div>
              <p className="px-1 text-xs leading-relaxed text-[#9AA3B2]">
                These also change the background and add something extra: 3D training androids on Home for Google-inspired, a living galaxy behind every
                screen for Sagittarius. Nothing here is loaded from the internet.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SPECIAL_THEME_IDS.map((id) => (
                  <PaletteCard key={id} theme={MODERN_THEMES[id]} />
                ))}
              </div>
              <div className="text-sm font-bold text-neutral-200 px-1">Soft palettes</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {['grounded', 'high_energy', 'mind_body', 'ocean_calm'].map((id) => (
                  <PaletteCard key={id} theme={MODERN_THEMES[id]} />
                ))}
              </div>
              <div className="text-sm font-bold text-neutral-200 px-1">Bold palettes</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.values(MODERN_THEMES)
                  .filter((t) => !['grounded', 'high_energy', 'mind_body', 'ocean_calm', ...SPECIAL_THEME_IDS].includes(t.id))
                  .map((t) => (
                    <PaletteCard key={t.id} theme={t} />
                  ))}
              </div>
            </div>
          )}

          {tab === 'create' && (
            <form onSubmit={handleSaveCustom} className="space-y-3">
              <div className="p-3 rounded-2xl bg-black/30 border border-[#1A1E26] space-y-2">
                <label className="text-xs font-semibold text-white">Palette name</label>
                <input value={customName} onChange={(e) => setCustomName(e.target.value)} maxLength={30} required className="w-full px-3 py-2 rounded-xl bg-black/40 border border-[#222836] text-sm text-white" />
              </div>
              {swatchRow('Main accent (buttons, rings, highlights)', primaryColor, setPrimaryColor)}
              <div className="flex flex-wrap gap-1.5 px-1">
                {PRESET_SWATCHES.map((s) => (
                  <button key={s} type="button" aria-label={`Use ${s}`} onClick={() => setPrimaryColor(s)} className={`w-6 h-6 rounded-full border transition-transform ${primaryColor.toLowerCase() === s.toLowerCase() ? 'scale-125 border-white' : 'border-black/40'}`} style={{ backgroundColor: shown(s) }} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {swatchRow('Second accent (sleep, recovery)', secondaryColor, setSecondaryColor)}
                {swatchRow('Third accent (effort, records)', tertiaryColor, setTertiaryColor)}
              </div>
              <button type="submit" className="w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2" style={{ backgroundColor: 'var(--accent)', color: 'var(--color-black)' }}>
                <Plus className="w-4 h-4" /> Save and use palette
              </button>
              <p className="text-xs text-[#9AA3B2] px-1">Your palette works on any background. On light backgrounds the colors are deepened a little so they stay readable.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
