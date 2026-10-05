import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptForLight, contrast, desaturate, isLight, lightFilter, lightPre, mix, neutralRamp, parseHex, readableOn, toHex } from '../lib/colorMath';

const dist = (a: string, b: string) => {
  const x = parseHex(a);
  const y = parseHex(b);
  return Math.max(Math.abs(x[0] - y[0]), Math.abs(x[1] - y[1]), Math.abs(x[2] - y[2]));
};

test('hex, mix and contrast basics', () => {
  assert.deepEqual(parseHex('#fff'), [255, 255, 255]);
  assert.equal(toHex([10, 20, 300]), '#0a14ff');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.ok(contrast('#000000', '#ffffff') > 20);
  assert.ok(isLight('#F6F0E4'));
  assert.ok(!isLight('#17181B'));
  assert.equal(readableOn('#F6F0E4'), '#1C1B18');
  assert.equal(readableOn('#17181B'), '#F6F1E7');
});

test('the light filter pre-image shows as the chosen pastel and ink on screen', () => {
  for (const c of ['#F6F0E4', '#FBF8F1', '#E3EBE0', '#F4E3E0', '#E7E3F3', '#DFE9F1', '#EFE5D1', '#2A2823', '#1F2A22', '#7A7466']) {
    const pre = lightPre(c);
    assert.ok(dist(lightFilter(pre), c) <= 4, `${c} -> pre ${pre} -> ${lightFilter(pre)}`);
  }
});

test('accents are made readable on pastel, then show as intended', () => {
  for (const c of ['#7A9B76', '#D9774E', '#C8F135', '#FF4A1C', '#D4A5A5', '#B8A9D9', '#6F93B8', '#D9B66F']) {
    const adapted = adaptForLight(c, '#F6F0E4');
    assert.ok(contrast(adapted, '#F6F0E4') >= 3, `${c} adapted to ${adapted}`);
    const shown = lightFilter(lightPre(adapted));
    assert.ok(dist(shown, adapted) <= 40, `${adapted} shows as ${shown}`);
  }
});

test('greys stay grey', () => {
  const p = parseHex(lightPre('#808080'));
  assert.ok(Math.abs(p[0] - p[1]) < 3 && Math.abs(p[1] - p[2]) < 3);
  assert.ok(desaturate('#ff0000', 0) === '#4c4c4c');
});

test('neutral ramp runs from the ink toward the background', () => {
  const r = neutralRamp('#F2EDE3', '#17181B');
  assert.equal(r['100'], '#f2ede3');
  assert.ok(contrast(r['400'], '#17181B') > contrast(r['700'], '#17181B'));
});
