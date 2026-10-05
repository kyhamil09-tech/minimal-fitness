import React from 'react';
import { Apple, Beef, Carrot, Cookie, CupSoda, Croissant, Droplet, Drumstick, Egg, Fish, Milk, Nut, Popcorn, Soup, Utensils, Wheat, Wine } from 'lucide-react';

/** One icon and one colour per food group (indexes match GROUPS in lib/foodDb). The colours are the palette's data colours. */
const ICONS = [Utensils, Milk, Egg, Beef, Drumstick, Fish, Wheat, Croissant, Apple, Carrot, Nut, Droplet, Cookie, Popcorn, CupSoda, Wine, Soup];
const COLORS = [
  'var(--ink-dim)', 'var(--g-blue)', 'var(--g-yellow)', 'var(--g-red)', 'var(--accent-2)', 'var(--g-cyan)', 'var(--g-yellow)', 'var(--accent-2)', 'var(--g-red)',
  'var(--g-green)', 'var(--g-yellow)', 'var(--g-yellow)', 'var(--g-purple)', 'var(--g-purple)', 'var(--g-blue)', 'var(--g-purple)', 'var(--accent)',
];

export const FoodIcon: React.FC<{ group: number; size?: number }> = ({ group, size = 40 }) => {
  const i = group >= 0 && group < ICONS.length ? group : 0;
  const Icon = ICONS[i];
  return (
    <span
      className="shrink-0 flex items-center justify-center rounded-full"
      style={{ width: size, height: size, color: COLORS[i], backgroundColor: `color-mix(in srgb, ${COLORS[i]} 17%, transparent)` }}
      aria-hidden="true"
    >
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
};
