import test from 'node:test';
import assert from 'node:assert/strict';
import { TOUR, TOUR_DOORS, shouldShowTour } from '../lib/tour';

test('every stop has a title, a lead and at least two bullets, and ids are unique', () => {
  assert.ok(TOUR.length >= 8);
  const ids = new Set<string>();
  for (const s of TOUR) {
    assert.ok(s.title.length > 3 && s.lead.length > 10, s.id);
    assert.ok(s.bullets.length >= 2 && s.bullets.every((b) => b.length > 10), s.id);
    assert.ok(/^#[0-9a-f]{6}$/i.test(s.color), s.id);
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`);
    ids.add(s.id);
  }
});

test('every door leads to a place the app knows, and each has a label', () => {
  for (const s of TOUR) if (s.go) {
    assert.ok(TOUR_DOORS.includes(s.go.to), s.id);
    assert.ok(s.go.label.length > 3, s.id);
  }
});

test('the tour opens on welcome, ends on privacy, and mentions replaying it', () => {
  assert.equal(TOUR[0].id, 'welcome');
  assert.equal(TOUR[TOUR.length - 1].id, 'privacy');
  assert.ok(TOUR[0].bullets.some((b) => /replay/i.test(b)));
  assert.equal(TOUR[TOUR.length - 1].asks, 'notifications');
});

test('the tour shows once after setup, never behind the welcome, and always when asked', () => {
  assert.equal(shouldShowTour(false, false, false, false), false);
  assert.equal(shouldShowTour(true, false, false, false), true);
  assert.equal(shouldShowTour(true, true, false, false), false);
  assert.equal(shouldShowTour(true, false, false, true), false);
  assert.equal(shouldShowTour(true, true, true, false), true);
  assert.equal(shouldShowTour(false, true, true, true), true);
});
