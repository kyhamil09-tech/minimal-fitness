/**
 * Supersets and circuits: exercises that sit side by side and share a group id are done in rounds (one set of each, in order),
 * with no rest between them and the rest after the last one. Two exercises make a superset, three or more a circuit.
 */
export interface GroupableItem {
  group?: string;
  rows: { done: boolean }[];
}

/** The first and last position of the run of exercises that share item `i`'s group, or just `i` when it is on its own. */
export const groupRange = (items: GroupableItem[], i: number): [number, number] => {
  const g = items[i]?.group;
  if (!g) return [i, i];
  let start = i;
  let end = i;
  while (start > 0 && items[start - 1].group === g) start--;
  while (end < items.length - 1 && items[end + 1].group === g) end++;
  return [start, end];
};

export type GroupKind = 'single' | 'superset' | 'circuit';

export const groupKind = (items: GroupableItem[], i: number): GroupKind => {
  const [s, e] = groupRange(items, i);
  const n = e - s + 1;
  return n >= 3 ? 'circuit' : n === 2 ? 'superset' : 'single';
};

/** "A1", "A2", "B1"...: which group (by order) and the position inside it. Empty for an exercise on its own. */
export const groupLabel = (items: GroupableItem[], i: number): string => {
  const [s] = groupRange(items, i);
  if (groupKind(items, i) === 'single') return '';
  let letter = 0;
  for (let k = 0; k < s; k++) {
    const [ks, ke] = groupRange(items, k);
    if (ks === k && ke > ks) letter++;
  }
  return `${String.fromCharCode(65 + (letter % 26))}${i - s + 1}`;
};

const newGroupId = (items: GroupableItem[]): string => {
  const used = new Set(items.map((i) => i.group).filter(Boolean));
  let n = 1;
  while (used.has(`g${n}`)) n++;
  return `g${n}`;
};

/** Makes exercise `i` and the one after it part of the same group, merging with a group the next one already belonged to. */
export const linkWithNext = <T extends GroupableItem>(items: T[], i: number): T[] => {
  if (i < 0 || i >= items.length - 1) return items;
  if (items[i].group && items[i].group === items[i + 1].group) return items;
  const id = items[i].group ?? newGroupId(items);
  const [, nextEnd] = groupRange(items, i + 1);
  return items.map((it, k) => (k === i || (k > i && k <= nextEnd) ? { ...it, group: id } : it));
};

/** Cuts the link between exercise `i` and the one after it. A part left on its own stops being a group. */
export const unlinkFromNext = <T extends GroupableItem>(items: T[], i: number): T[] => {
  if (i < 0 || i >= items.length - 1) return items;
  const g = items[i].group;
  if (!g || items[i + 1].group !== g) return items;
  const [s, e] = groupRange(items, i);
  const rightId = newGroupId(items.map((it) => ({ ...it })));
  const out = items.map((it, k) => {
    if (k >= s && k <= i) return s === i ? { ...it, group: undefined } : it;
    if (k > i && k <= e) return i + 1 === e ? { ...it, group: undefined } : { ...it, group: rightId };
    return it;
  });
  return out;
};

/** Removes exercise `i` and repairs the groups around it (a group left with one exercise stops being a group). */
export const removeAt = <T extends GroupableItem>(items: T[], i: number): T[] => {
  const g = items[i]?.group;
  const rest = items.filter((_, k) => k !== i);
  if (!g) return rest;
  const left = rest.filter((it) => it.group === g);
  return left.length >= 2 ? rest : rest.map((it) => (it.group === g ? { ...it, group: undefined } : it));
};

/** The first exercise after `from` (then from the top) that still has a set to do, or `from` when none has. */
export const nextPending = (items: GroupableItem[], from: number): number => {
  for (let i = from + 1; i < items.length; i++) if (items[i].rows.some((r) => !r.done)) return i;
  for (let i = 0; i < from; i++) if (items[i].rows.some((r) => !r.done)) return i;
  return from;
};

/**
 * After set `ri` of exercise `ei` is ticked off. For an exercise in a group: go to the next exercise of the group that has the
 * same set still to do, with no rest; at the end of the round rest, and then start the next round at the top of the group.
 * Returns null for an exercise on its own, which keeps the usual behaviour (rest, stay put).
 * `items` must already show the set as done.
 */
export const afterGroupedSetDone = (items: GroupableItem[], ei: number, ri: number): { cursor: number; rest: boolean } | null => {
  const [s, e] = groupRange(items, ei);
  if (s === e) return null;
  for (let j = ei + 1; j <= e; j++) {
    const row = items[j].rows[ri];
    if (row && !row.done) return { cursor: j, rest: false };
  }
  // End of the round: back to the top of the group for the next one, or on past the group when it is finished.
  for (let k = s; k <= e; k++) if (items[k].rows.some((r) => !r.done)) return { cursor: k, rest: true };
  return { cursor: nextPending(items, e), rest: true };
};
