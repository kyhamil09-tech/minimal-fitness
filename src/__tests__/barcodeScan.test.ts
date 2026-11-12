import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeLuminance, toLuminance } from '../lib/barcodeScan';
import { barcodeCandidates } from '../lib/barcode';

// EAN/UPC bar patterns from the GS1 specification, so the tests draw real barcodes without depending on a writer library.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

const ean13Bits = (d: string): string => {
  const n = [...d].map(Number);
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (PARITY[n[0]][i - 1] === 'L' ? L : G)[n[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[n[i]];
  return bits + '101';
};
const ean8Bits = (d: string): string => {
  const n = [...d].map(Number);
  return '101' + n.slice(0, 4).map((x) => L[x]).join('') + '01010' + n.slice(4).map((x) => R[x]).join('') + '101';
};

/** Draws bars as grey pixels (black on white, with a quiet zone), the way a camera frame would see them. */
const picture = (bits: string, scale = 3): { luma: Uint8ClampedArray; w: number; h: number } => {
  const quiet = 12 * scale;
  const w = bits.length * scale + quiet * 2;
  const h = 70 * scale + quiet * 2;
  const luma = new Uint8ClampedArray(w * h).fill(255);
  for (let y = quiet; y < h - quiet; y++) {
    for (let x = 0; x < bits.length * scale; x++) {
      if (bits[Math.floor(x / scale)] === '1') luma[y * w + quiet + x] = 0;
    }
  }
  return { luma, w, h };
};

test('an EAN-13 barcode in a picture is read back as its digits', async () => {
  const { luma, w, h } = picture(ean13Bits('5449000000996'));
  assert.equal(await decodeLuminance(luma, w, h), '5449000000996');
});

test('EAN-8 and US (UPC-A) codes are read too', async () => {
  const a = picture(ean8Bits('96385074'));
  assert.equal(await decodeLuminance(a.luma, a.w, a.h), '96385074');
  // A UPC-A code is an EAN-13 that starts with 0; readers give it as 12 digits or as 13 with the 0 in front.
  const b = picture(ean13Bits('0036000291452'));
  const read = await decodeLuminance(b.luma, b.w, b.h);
  assert.ok(read === '036000291452' || read === '0036000291452', String(read));
});

test('a code a little blurred and smaller in the frame is still read', async () => {
  const p = picture(ean13Bits('4006381333931'), 2);
  // soften every row a little, like an out-of-focus camera
  const blurred = new Uint8ClampedArray(p.luma.length);
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x;
      blurred[i] = (p.luma[i - (x > 0 ? 1 : 0)] + p.luma[i] * 2 + p.luma[i + (x < p.w - 1 ? 1 : 0)]) / 4;
    }
  }
  assert.equal(await decodeLuminance(blurred, p.w, p.h), '4006381333931');
});

test('a picture with no barcode gives nothing, not an error', async () => {
  const blank = new Uint8ClampedArray(200 * 120).fill(180);
  assert.equal(await decodeLuminance(blank, 200, 120), null);
});

test('camera pixels become one grey byte each', () => {
  const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]);
  const grey = toLuminance(rgba, 3);
  assert.equal(grey[0], 255);
  assert.equal(grey[1], 0);
  assert.ok(grey[2] > 60 && grey[2] < 90);
});

test('a 12-digit US code is looked up in the 13-digit form Open Food Facts keeps, then as read', () => {
  assert.deepEqual(barcodeCandidates('036000291452'), ['0036000291452', '036000291452']);
  assert.deepEqual(barcodeCandidates('5449000000996'), ['5449000000996']);
  assert.deepEqual(barcodeCandidates(' 5449 0000 00996 '), ['5449000000996']);
});