import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_MAP, PROGRESS_SECTIONS, RUN_SECTIONS, SETTINGS_GROUPS, allMapItems, progressSectionFor, searchMap } from '../lib/appMap';

test('every item is unique and points at a real place', () => {
  const items = allMapItems();
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  for (const i of items) {
    const t = i.target;
    if (t.run) assert.ok((RUN_SECTIONS as readonly string[]).includes(t.run), `${i.id}: run ${t.run}`);
    if (t.progress) assert.ok((PROGRESS_SECTIONS as readonly string[]).includes(t.progress), `${i.id}: progress ${t.progress}`);
    if (t.settings) assert.ok((SETTINGS_GROUPS as readonly string[]).includes(t.settings), `${i.id}: settings ${t.settings}`);
    // a section only makes sense on its own tab
    if (t.run) assert.equal(t.tab, 'exercise');
    if (t.progress) assert.equal(t.tab, 'progress');
    if (t.settings) assert.equal(t.tab, 'settings');
    assert.ok(i.label.length > 0 && i.sub.length > 0);
  }
});

test('every section of the Run tab, Progress and every Settings group can be reached from the map', () => {
  const items = allMapItems();
  for (const s of RUN_SECTIONS) assert.ok(items.some((i) => i.target.run === s), `run ${s}`);
  for (const s of PROGRESS_SECTIONS) assert.ok(items.some((i) => i.target.progress === s), `progress ${s}`);
  for (const s of SETTINGS_GROUPS) assert.ok(items.some((i) => i.target.settings === s), `settings ${s}`);
});

test('the map is five areas and none of them is overwhelming', () => {
  assert.equal(APP_MAP.length, 5);
  for (const a of APP_MAP) assert.ok(a.items.length >= 3 && a.items.length <= 6, `${a.id} has ${a.items.length}`);
});

test('search matches the start of words in the name, the line under it and its keywords', () => {
  assert.deepEqual(searchMap('sleep').map((i) => i.id).slice(0, 1), ['sleep']);
  assert.ok(searchMap('grocery').some((i) => i.id === 'mealplan'));
  assert.ok(searchMap('blood pres').some((i) => i.id === 'healthlog'));
  assert.ok(searchMap('health connect').some((i) => i.id === 'devices'));
  assert.ok(searchMap('backup').some((i) => i.id === 'data'));
  // every typed word has to match
  assert.equal(searchMap('sleep xylophone').length, 0);
});

test('an empty search matches nothing, and a middle-of-word fragment does not match', () => {
  assert.deepEqual(searchMap(''), []);
  assert.deepEqual(searchMap('   '), []);
  assert.equal(searchMap('ealth').length, 0);
});

test('the Health tab stands for Vitals inside Progress', () => {
  assert.equal(progressSectionFor('health'), 'vitals');
  assert.equal(progressSectionFor('progress'), 'trends');
  assert.equal(progressSectionFor('progress', 'awards'), 'awards');
});
