export type ThemeId =
  | 'kinetic'
  | 'volt'
  | 'hyper_mint'
  | 'cyber_ice'
  | 'solar_flame'
  | 'ultra_violet'
  | 'crimson_pulse'
  | 'electric_lime'
  | 'sunset_gold'
  | 'stealth_platinum'
  | 'tokyo_neon'
  | 'emerald_matrix'
  | 'arctic_glacier'
  | 'blood_moon'
  | 'cyber_amber'
  | 'rose_gold'
  | string;

export interface ColorPalette {
  id: ThemeId;
  name: string;
  tagline: string;
  isCustom?: boolean;
  primary: string; // Main brand & readiness accent
  primaryGlow: string;
  primaryContainer: string;
  secondary: string; // Recovery / Sleep accent
  tertiary: string; // Strain / Active burn accent
  surface: string; // Card background
  surfaceBorder: string; // Hairline border
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  ecgStroke: string;
  sleepStages: {
    deep: string;
    rem: string;
    light: string;
    awake: string;
  };
  /** The colors charts, rings and heart-rate zones use. Palettes without them keep the app's standard set. */
  data?: DataColors;
  /**
   * A special theme that adds something beyond colors: 'google' puts friendly bot mascots on Home, 'galaxy' draws a living galaxy behind
   * the screens. Only the theme that names a scene gets it; every other theme looks as it always did.
   */
  scene?: 'google' | 'galaxy';
  /** What choosing this palette also sets: the background for each family, which family to open in, and the ambient glow. */
  preset?: { light?: string; dark?: string; mode: 'dark' | 'light'; glow?: 'always' };
}

export interface DataColors {
  blue: string;
  green: string;
  cyan: string;
  red: string;
  yellow: string;
  purple: string;
}
