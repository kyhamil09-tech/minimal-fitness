export type ThemeId =
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
  /** The colours charts, rings and heart-rate zones use. Palettes without them keep the app's standard set. */
  data?: DataColors;
}

export interface DataColors {
  blue: string;
  green: string;
  cyan: string;
  red: string;
  yellow: string;
  purple: string;
}
