import test from 'node:test';
import assert from 'node:assert/strict';
import { LatLng, staticMapView, tileUrl, worldPixel } from '../lib/staticMap';

const loop = (lat: number, lng: number, r: number): LatLng[] => Array.from({ length: 40 }, (_, i) => [lat + Math.sin((i / 40) * Math.PI * 2) * r, lng + (Math.cos((i / 40) * Math.PI * 2) - 1) * r * 1.3]);

test('web mercator: the equator and the date line sit where they should', () => {
  const a = worldPixel(0, 0, 0);
  assert.ok(Math.abs(a.x - 128) < 1e-6 && Math.abs(a.y - 128) < 1e-6);
  assert.ok(Math.abs(worldPixel(0, -180, 2).x) < 1e-6);
  assert.ok(Math.abs(worldPixel(0, 180, 2).x - 1024) < 1e-6);
  // Higher latitudes are nearer the top of the picture.
  assert.ok(worldPixel(60, 0, 3).y < worldPixel(10, 0, 3).y);
});

test('a loop around a few blocks gets a city-block zoom, a few tiles, and every point inside the picture', () => {
  const route = loop(40.758, -73.9855, 0.004);
  const v = staticMapView(route, 280, 110);
  assert.ok(v);
  assert.ok(v!.zoom >= 12 && v!.zoom <= 16, `zoom ${v!.zoom}`);
  assert.ok(v!.tiles.length >= 1 && v!.tiles.length <= 12);
  for (const p of v!.points.split(' ')) {
    const [x, y] = p.split(',').map(Number);
    assert.ok(x >= 0 && x <= 280 && y >= 0 && y <= 110, `${p} outside`);
  }
});

test('the tiles together cover the whole picture', () => {
  const v = staticMapView(loop(51.5, -0.12, 0.01), 280, 110)!;
  const minX = Math.min(...v.tiles.map((t) => t.px));
  const maxX = Math.max(...v.tiles.map((t) => t.px + 256));
  const minY = Math.min(...v.tiles.map((t) => t.py));
  const maxY = Math.max(...v.tiles.map((t) => t.py + 256));
  assert.ok(minX <= 0 && maxX >= 280 && minY <= 0 && maxY >= 110);
});

test('a long route zooms out, and a very short one stops at the highest zoom', () => {
  const long = staticMapView([[40, -75], [41, -73]], 280, 110)!;
  assert.ok(long.zoom <= 9);
  const tiny = staticMapView([[40.0, -75.0], [40.00001, -75.00001]], 280, 110)!;
  assert.equal(tiny.zoom, 16);
  assert.equal(staticMapView([[1, 1]], 280, 110), null);
});

test('start and end follow the route, and tile addresses fill the template', () => {
  const route = loop(40.758, -73.9855, 0.004);
  const v = staticMapView(route, 280, 110)!;
  assert.equal(`${v.start.x.toFixed(1)},${v.start.y.toFixed(1)}`, v.points.split(' ')[0]);
  assert.equal(tileUrl('https://x/{z}/{y}/{x}', 14, 4823, 6159), 'https://x/14/6159/4823');
});
