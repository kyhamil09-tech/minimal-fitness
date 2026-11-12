import { Backdrop } from '../data/backdrops';
import { ColorPalette } from '../types/theme';
import { adaptForLight, mix, readableOn } from './colorMath';
import { DEFAULT_LOGO, LogoColors, LogoStyle } from './appLogo';

/**
 * The colors the share cards are drawn with: the background and palette you chose, so a card made on a cream and sage look comes out
 * cream and sage. These are the colors as they should appear in the picture (nothing here goes through the page's light filter).
 */
export interface CardSkin {
  bg: string;
  card: string;
  ink: string;
  dim: string;
  hair: string;
  accent: string;
  accent2: string;
  onAccent: string;
  light: boolean;
  /** The logo in the shape and colors chosen in Settings, drawn on the cards. */
  logo: { style: LogoStyle; colors: LogoColors };
}

export const DARK_SKIN: CardSkin = {
  bg: '#09090B',
  card: '#121316',
  ink: '#F4F4F6',
  dim: '#A1A1AA',
  hair: '#23252B',
  accent: '#FF5500',
  accent2: '#00E5FF',
  onAccent: '#09090B',
  light: false,
  logo: DEFAULT_LOGO,
};

export const skinFrom = (b: Backdrop, p: ColorPalette, logo: CardSkin['logo'] = DEFAULT_LOGO): CardSkin => {
  const light = b.family === 'light';
  const accent = light ? adaptForLight(p.primary, b.bg, 3) : p.primary;
  const accent2 = light ? adaptForLight(p.secondary, b.bg, 3) : p.secondary;
  return { bg: b.bg, card: b.card, ink: b.ink, dim: b.inkDim, hair: b.hairline, accent, accent2, onAccent: readableOn(accent, '#14130F', '#F6F1E7'), light, logo };
};

/** A soft tint of the accent over the background, used for the card's panels. */
export const panelTint = (s: CardSkin, amount = 0.12): string => mix(s.card, s.accent, amount);

let current: CardSkin = DARK_SKIN;

/** The app keeps this up to date whenever the look changes, so any screen can draw a card in the current look. */
export const setCardSkin = (s: CardSkin) => {
  current = s;
};
export const getCardSkin = (): CardSkin => current;
