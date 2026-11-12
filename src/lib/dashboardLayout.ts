/** The tiles and cards on Home that can be shown, hidden and reordered. */
export type WidgetId = 'lift' | 'run' | 'rings' | 'steps' | 'water' | 'heart' | 'sleep' | 'calories' | 'mood' | 'readiness' | 'weather' | 'week' | 'monthly' | 'last' | 'watch';

export interface WidgetInfo {
  id: WidgetId;
  label: string;
  hint: string;
  /** Half-width tiles sit two to a row; the rest take the full width. */
  half: boolean;
}

export const WIDGETS: WidgetInfo[] = [
  { id: 'run', label: 'Today', hint: 'Your next run or workout, with Start', half: false },
  { id: 'rings', label: 'Today’s rings', hint: 'Steps, active minutes and fuel as rings', half: false },
  { id: 'lift', label: 'Lift', hint: 'Open the weightlifting log', half: false },
  { id: 'steps', label: 'Steps', hint: 'Today and your goal', half: true },
  { id: 'water', label: 'Water', hint: 'Add and remove drinks right here', half: true },
  { id: 'heart', label: 'Heart rate', hint: 'Live or latest', half: true },
  { id: 'sleep', label: 'Sleep', hint: 'Last night', half: true },
  { id: 'calories', label: 'Calories eaten', hint: 'Against your daily goal', half: false },
  { id: 'mood', label: 'Mood and energy', hint: 'A one-tap daily check-in', half: false },
  { id: 'readiness', label: 'Readiness', hint: 'How ready you are to train', half: false },
  { id: 'weather', label: 'Weather', hint: 'For your run', half: false },
  { id: 'week', label: 'This week', hint: 'Distance, workouts and the plan', half: false },
  { id: 'monthly', label: 'Monthly goal', hint: 'Your goal for the month', half: false },
  { id: 'last', label: 'Last activity', hint: 'Your most recent run or walk', half: false },
  { id: 'watch', label: 'Watch and Health Connect', hint: 'Extra numbers from your watch', half: false },
];

export const WIDGET_IDS: WidgetId[] = WIDGETS.map((w) => w.id);

export interface DashboardLayout {
  /** Every widget, in the order shown. */
  order: WidgetId[];
  hidden: WidgetId[];
}

/** What a new install shows: the four everyday tiles plus calories and the week. The rest are one tap away in Edit. */
export const DEFAULT_HIDDEN: WidgetId[] = ['readiness', 'weather', 'monthly', 'last', 'watch'];

export const DEFAULT_LAYOUT: DashboardLayout = { order: WIDGET_IDS, hidden: DEFAULT_HIDDEN };

/** The layout every install had before the tidy-up: everything shown, in the original order. */
export const isUntouchedOldDefault = (raw: unknown): boolean => {
  const r = raw as { order?: unknown; hidden?: unknown } | null;
  return !!r && Array.isArray(r.hidden) && r.hidden.length === 0 && Array.isArray(r.order) && r.order.join() === WIDGET_IDS.join();
};

const known = new Set<string>(WIDGET_IDS);

/** Repairs a stored layout: drops unknown ids and duplicates, and appends any widget the stored layout predates. */
export const sanitizeLayout = (raw: unknown): DashboardLayout => {
  if (!raw || typeof raw !== 'object') return { order: [...DEFAULT_LAYOUT.order], hidden: [...DEFAULT_LAYOUT.hidden] };
  if (isUntouchedOldDefault(raw)) return { order: [...DEFAULT_LAYOUT.order], hidden: [...DEFAULT_LAYOUT.hidden] };
  const r = raw as { order?: unknown; hidden?: unknown };
  const list = (v: unknown): WidgetId[] => (Array.isArray(v) ? (v.filter((x) => typeof x === 'string' && known.has(x)) as WidgetId[]) : []);
  const order = [...new Set(list(r.order))];
  // Today, the rings and Lift lead a layout saved before they were tiles.
  order.unshift(...(['run', 'rings', 'lift'] as WidgetId[]).filter((id) => !order.includes(id)));
  for (const id of WIDGET_IDS) if (!order.includes(id)) order.push(id);
  const hidden = [...new Set(list(r.hidden))];
  return { order, hidden };
};

export const visibleWidgets = (layout: DashboardLayout): WidgetId[] => layout.order.filter((id) => !layout.hidden.includes(id));

export const toggleWidget = (layout: DashboardLayout, id: WidgetId): DashboardLayout => ({
  ...layout,
  hidden: layout.hidden.includes(id) ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id],
});

/** Moves a widget one place up (-1) or down (+1) among all widgets. */
export const moveWidget = (layout: DashboardLayout, id: WidgetId, dir: -1 | 1): DashboardLayout => {
  const i = layout.order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= layout.order.length) return layout;
  const order = [...layout.order];
  [order[i], order[j]] = [order[j], order[i]];
  return { ...layout, order };
};

/** Puts a widget where another one is, shifting the ones in between (what dragging a tile onto another does). */
export const moveWidgetTo = (layout: DashboardLayout, id: WidgetId, targetId: WidgetId): DashboardLayout => {
  const from = layout.order.indexOf(id);
  const to = layout.order.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return layout;
  const order = [...layout.order];
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { ...layout, order };
};

/** Groups neighbouring half-width tiles so each group can be laid out as a two-column grid. */
export const groupWidgets = (ids: WidgetId[]): { half: boolean; ids: WidgetId[] }[] => {
  const half = new Set(WIDGETS.filter((w) => w.half).map((w) => w.id));
  const groups: { half: boolean; ids: WidgetId[] }[] = [];
  for (const id of ids) {
    const h = half.has(id);
    const last = groups[groups.length - 1];
    if (h && last?.half) last.ids.push(id);
    else groups.push({ half: h, ids: [id] });
  }
  return groups;
};

/** The new Home puts Today first, then the rings, then Lift: a saved layout is moved to that start once, the rest of its order kept. */
export const withTodayFirst = (layout: DashboardLayout): DashboardLayout => {
  const lead: WidgetId[] = ['run', 'rings', 'lift'];
  return { ...layout, order: [...lead, ...layout.order.filter((id) => !lead.includes(id))] };
};
