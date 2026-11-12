import React, { useEffect, useState } from 'react';
import { LOGO_BOX, LogoColors, LogoStyle, logoShapes } from '../lib/appLogo';
import { lightPre } from '../lib/colorMath';
import { usePrefs } from '../lib/prefs';

/** True while the light family is on (the page is drawn through a color-flipping filter then, so colors are pre-adjusted). */
export const usePageIsLight = (): boolean => {
  const read = () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';
  const [light, setLight] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setLight(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return light;
};

/** The app logo, in the colors and shape chosen in Settings > Look & feel (or the ones passed in, for previews). */
export const AppLogo: React.FC<{
  size?: number;
  style?: LogoStyle;
  colors?: LogoColors;
  /** Draw the colored square behind it (an app icon) rather than the bare logo. */
  tile?: boolean;
  className?: string;
  label?: string;
}> = ({ size = 40, style, colors, tile = true, className, label = 'Minimal Fitness' }) => {
  const { prefs } = usePrefs();
  const light = usePageIsLight();
  const s = style ?? prefs.logoStyle;
  const chosen = colors ?? { bg: prefs.logoBg, ink: prefs.logoInk };
  const c = light ? { bg: lightPre(chosen.bg), ink: lightPre(chosen.ink) } : chosen;
  // The shapes are plain SVG, so they are drawn straight into the page (no image to fetch).
  return (
    <svg width={size} height={size} viewBox={`0 0 ${LOGO_BOX} ${LOGO_BOX}`} className={className} role="img" aria-label={label}>
      {tile && <rect width={LOGO_BOX} height={LOGO_BOX} rx={224} fill={c.bg} />}
      <g dangerouslySetInnerHTML={{ __html: logoShapes(s, c) }} />
    </svg>
  );
};
