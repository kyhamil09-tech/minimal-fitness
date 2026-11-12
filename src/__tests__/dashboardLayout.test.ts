import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LAYOUT, WIDGET_IDS, groupWidgets, moveWidget, sanitizeLayout, toggleWidget, visibleWidgets } from '../lib/dashboardLayout';

test('a stored layout is repaired: unknown and repeated ids go, new widgets are added at the end', () => {
  const fixed = sanitizeLayout({ order: ['water', 'bogus', 'water', 'steps'], hidden: ['steps', 'nope'] });
  assert.deepEqual(fixed.order.slice(3, 5), ['water', 'steps']);
  assert.equal(fixed.order.length, WIDGET_IDS.length);
  assert.deepEqual(fixed.hidden, ['steps']);
  assert.deepEqual(sanitizeLayout(null), DEFAULT_LAYOUT);
});

test('hiding removes a widget from view, showing brings it back in its place', () => {
  const hidden = toggleWidget(DEFAULT_LAYOUT, 'water');
  assert.ok(!visibleWidgets(hidden).includes('water'));
  const back = toggleWidget(hidden, 'water');
  assert.deepEqual(visibleWidgets(back), visibleWidgets(DEFAULT_LAYOUT));
});

test('a new install shows the everyday tiles; the old show-everything default is tidied once', () => {
  assert.deepEqual(visibleWidgets(DEFAULT_LAYOUT), ['run', 'rings', 'lift', 'steps', 'water', 'heart', 'sleep', 'calories', 'mood', 'week']);
  assert.deepEqual(sanitizeLayout({ order: WIDGET_IDS, hidden: [] }), DEFAULT_LAYOUT);
  // someone who chose their own tiles keeps them
  assert.deepEqual(sanitizeLayout({ order: WIDGET_IDS, hidden: ['water'] }).hidden, ['water']);
});

test('moving swaps neighbours and stops at the ends', () => {
  const moved = moveWidget(DEFAULT_LAYOUT, 'water', -1);
  assert.deepEqual(moved.order.slice(3, 5), ['water', 'steps']);
  assert.equal(moveWidget(DEFAULT_LAYOUT, 'run', -1), DEFAULT_LAYOUT);
  const last = WIDGET_IDS[WIDGET_IDS.length - 1];
  assert.equal(moveWidget(DEFAULT_LAYOUT, last, 1), DEFAULT_LAYOUT);
});

test('neighbouring half-width tiles share a row group', () => {
  const groups = groupWidgets(['steps', 'water', 'calories', 'sleep', 'week']);
  assert.deepEqual(
    groups.map((g) => g.ids),
    [['steps', 'water'], ['calories'], ['sleep'], ['week']]
  );
});

test('dragging a tile onto another puts it in that place', async () => {
  const { moveWidgetTo } = await import('../lib/dashboardLayout');
  const a = moveWidgetTo(DEFAULT_LAYOUT, 'week', 'steps');
  assert.deepEqual(a.order.slice(3, 5), ['week', 'steps']);
  const b = moveWidgetTo(DEFAULT_LAYOUT, 'steps', 'heart');
  assert.deepEqual(b.order.slice(3, 6), ['water', 'heart', 'steps']);
  assert.equal(moveWidgetTo(DEFAULT_LAYOUT, 'steps', 'steps'), DEFAULT_LAYOUT);
});

test('a layout saved before Lift and Run club were tiles keeps them at the top, and either can be hidden or moved', () => {
  const old = sanitizeLayout({ order: ['steps', 'water'], hidden: [] });
  assert.deepEqual(old.order.slice(0, 4), ['run', 'rings', 'lift', 'steps']);
  assert.ok(!visibleWidgets(toggleWidget(DEFAULT_LAYOUT, 'run')).includes('run'));
  assert.deepEqual(moveWidget(DEFAULT_LAYOUT, 'run', 1).order.slice(0, 3), ['rings', 'run', 'lift']);
});

test('the new Home puts Today, the rings and Lift first and keeps the rest of a saved order', async () => {
  const { withTodayFirst } = await import('../lib/dashboardLayout');
  const saved = { order: ['lift', 'water', 'run', 'steps', 'rings'] as never[], hidden: ['steps'] as never[] };
  const moved = withTodayFirst(saved);
  assert.deepEqual(moved.order, ['run', 'rings', 'lift', 'water', 'steps']);
  assert.deepEqual(moved.hidden, ['steps']);
});
