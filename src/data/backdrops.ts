import { isLight, mix, readableOn } from '../lib/colorMath';

/**
 * Page backgrounds. Every colour in a backdrop is the colour you SEE: the theme system turns these into the right values for the
 * dark and light families (see lib/appearance.ts). Dark backdrops are soft off-blacks rather than pure black (AMOLED stays as an
 * option for OLED screens), and the light family is a set of pastels and warm creams rather than pure white.
 */
export interface Backdrop {
  id: string;
  name: string;
  family: 'dark' | 'light';
  /** The page behind everything. */
  bg: string;
  /** Cards and sheets. */
  card: string;
  /** Raised or inset pieces inside a card. */
  card2: string;
  hairline: string;
  hairlineStrong: string;
  /** Main text, never pure white or pure black. */
  ink: string;
  /** Secondary text. */
  inkDim: string;
  custom?: boolean;
}

const CREAM_INK = '#F2EDE3';

export const DARK_BACKDROPS: Backdrop[] = [
  { id: 'charcoal', name: 'Charcoal', family: 'dark', bg: '#17181B', card: '#212226', card2: '#2B2C31', hairline: '#34353B', hairlineStrong: '#47484F', ink: CREAM_INK, inkDim: '#A29E95' },
  { id: 'amoled', name: 'AMOLED black', family: 'dark', bg: '#000000', card: '#111111', card2: '#181818', hairline: '#232323', hairlineStrong: '#343434', ink: CREAM_INK, inkDim: '#9A968D' },
  { id: 'slate', name: 'Midnight slate', family: 'dark', bg: '#11151C', card: '#1A202A', card2: '#232B37', hairline: '#2B3442', hairlineStrong: '#3B475A', ink: '#E9EEF5', inkDim: '#8E9AAB' },
  { id: 'forest', name: 'Deep sage', family: 'dark', bg: '#131A16', card: '#1C2621', card2: '#25312A', hairline: '#2F3C34', hairlineStrong: '#41524A', ink: '#EEF0E4', inkDim: '#98A69B' },
  { id: 'plum', name: 'Dusk plum', family: 'dark', bg: '#1A161C', card: '#251F28', card2: '#2F2833', hairline: '#3A3340', hairlineStrong: '#4E4557', ink: '#F1E9EE', inkDim: '#A596A3' },
  { id: 'ocean', name: 'Deep ocean', family: 'dark', bg: '#0F171E', card: '#18232C', card2: '#212F3B', hairline: '#2A3A4A', hairlineStrong: '#3B4F63', ink: '#E7F0F5', inkDim: '#8DA3B3' },
  { id: 'espresso', name: 'Espresso', family: 'dark', bg: '#1C1713', card: '#27201B', card2: '#322A24', hairline: '#3E352D', hairlineStrong: '#54483D', ink: '#F4EBE0', inkDim: '#AC9F90' },
];

export const LIGHT_BACKDROPS: Backdrop[] = [
  { id: 'cream', name: 'Warm cream', family: 'light', bg: '#F6F0E4', card: '#FBF8F1', card2: '#EFE8DA', hairline: '#E2D9C6', hairlineStrong: '#CFC4AC', ink: '#2A2823', inkDim: '#7A7466' },
  { id: 'alabaster', name: 'Alabaster', family: 'light', bg: '#F3F1ED', card: '#FAF9F6', card2: '#ECE9E3', hairline: '#DEDAD2', hairlineStrong: '#C9C4B9', ink: '#26262A', inkDim: '#76757B' },
  { id: 'sage_mist', name: 'Sage mist', family: 'light', bg: '#E3EBE0', card: '#F0F5ED', card2: '#D8E2D4', hairline: '#C7D4C2', hairlineStrong: '#B0C0AA', ink: '#1F2A22', inkDim: '#66756A' },
  { id: 'blush', name: 'Blush', family: 'light', bg: '#F4E3E0', card: '#FBF1EE', card2: '#EBD6D2', hairline: '#E0C5C0', hairlineStrong: '#CFAEA8', ink: '#2E2224', inkDim: '#85706F' },
  { id: 'lavender', name: 'Lavender', family: 'light', bg: '#E7E3F3', card: '#F3F0FA', card2: '#DAD5EA', hairline: '#CBC4E0', hairlineStrong: '#B5ADD0', ink: '#25212E', inkDim: '#756F89' },
  { id: 'sky', name: 'Soft sky', family: 'light', bg: '#DFE9F1', card: '#EEF4F9', card2: '#D2E0EB', hairline: '#BFD1E0', hairlineStrong: '#A8BFD2', ink: '#1E2730', inkDim: '#66798A' },
  { id: 'sand', name: 'Sand', family: 'light', bg: '#EFE5D1', card: '#F8F1E3', card2: '#E6D9BF', hairline: '#D8C9A8', hairlineStrong: '#C4B28C', ink: '#2B261C', inkDim: '#7D7358' },
  { id: 'apricot', name: 'Apricot', family: 'light', bg: '#F5E0D2', card: '#FBEEE5', card2: '#EBD0BE', hairline: '#DDBFA9', hairlineStrong: '#CBA68C', ink: '#2D2220', inkDim: '#86705F' },
];

export const ALL_BACKDROPS: Backdrop[] = [...DARK_BACKDROPS, ...LIGHT_BACKDROPS];

export const DEFAULT_DARK = 'charcoal';
export const DEFAULT_LIGHT = 'cream';

export const findBackdrop = (id: string, custom: Record<string, Backdrop> = {}): Backdrop | undefined =>
  custom[id] ?? ALL_BACKDROPS.find((b) => b.id === id);

/** A backdrop from one chosen background colour: the card, edge and text colours are worked out to match. */
export const makeBackdrop = (id: string, name: string, bg: string): Backdrop => {
  if (isLight(bg)) {
    const ink = readableOn(bg, '#2A2823', '#F6F1E7');
    return { id, name, family: 'light', bg, card: mix(bg, '#FFFFFF', 0.55), card2: mix(bg, '#000000', 0.05), hairline: mix(bg, '#000000', 0.1), hairlineStrong: mix(bg, '#000000', 0.2), ink, inkDim: mix(ink, bg, 0.5), custom: true };
  }
  return { id, name, family: 'dark', bg, card: mix(bg, '#FFFFFF', 0.06), card2: mix(bg, '#FFFFFF', 0.11), hairline: mix(bg, '#FFFFFF', 0.16), hairlineStrong: mix(bg, '#FFFFFF', 0.25), ink: CREAM_INK, inkDim: mix(CREAM_INK, bg, 0.5), custom: true };
};
