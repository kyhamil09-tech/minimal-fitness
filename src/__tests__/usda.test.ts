import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_KEY, fdcRecord, getFdcKey, pickByBarcode } from '../lib/usda';
import { NET_FEATURES, contentSecurityPolicy } from '../lib/netHosts';

const item = {
  fdcId: 1234,
  description: 'CHOCOLATE PEANUT BUTTER BAR',
  brandOwner: 'ACME FOODS INC',
  brandName: 'ACME',
  gtinUpc: '012345678905',
  servingSize: 40,
  servingSizeUnit: 'g',
  householdServingFullText: '1 bar',
  foodNutrients: [
    { nutrientNumber: '208', value: 450 },
    { nutrientNumber: '203', value: 10 },
    { nutrientNumber: '205', value: 55 },
    { nutrientNumber: '204', value: 22 },
    { nutrientNumber: '291', value: 4.5 },
    { nutrientNumber: '269', value: 30 },
    { nutrientNumber: '307', value: 210 },
    { nutrientNumber: '301', value: 80 },
  ],
};

test('a branded USDA food becomes a food record per 100 g with its serving and vitamins', () => {
  const r = fdcRecord(item)!;
  assert.equal(r.name, 'Chocolate Peanut Butter Bar');
  assert.equal(r.brand, 'Acme');
  assert.equal(r.kcal, 450);
  assert.equal(r.p, 10);
  assert.equal(r.sodium, 210);
  assert.deepEqual(r.portions, [{ label: '1 serving (1 bar)', g: 40 }]);
  assert.equal(r.micros?.calcium, 80);
  assert.equal(r.src, 'usda');
});

test('the product with the matching barcode is chosen, whatever zeros are in front', () => {
  const json = { foods: [{ ...item, gtinUpc: '999999999999', description: 'Other' }, item] };
  assert.equal(pickByBarcode(json, '12345678905')?.id, 'fdc:1234');
  assert.equal(pickByBarcode(json, '0012345678905')?.id, 'fdc:1234');
  assert.equal(pickByBarcode(json, '4000000000000'), null);
  assert.equal(pickByBarcode({}, '12345678905'), null);
});

test('an entry with no calories is not used', () => {
  assert.equal(fdcRecord({ ...item, foodNutrients: [{ nutrientNumber: '203', value: 3 }] }), null);
});

test('the key is the shared demo key unless a plausible key of your own is saved', () => {
  assert.equal(getFdcKey({ getItem: () => null }), DEMO_KEY);
  assert.equal(getFdcKey({ getItem: () => 'short' }), DEMO_KEY);
  assert.equal(getFdcKey({ getItem: () => 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789' }), 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
});

test('the USDA service is on the list of places the app may contact, and the security policy allows it', () => {
  const f = NET_FEATURES.find((x) => x.hosts.includes('api.nal.usda.gov'));
  assert.ok(f && f.optIn && f.viaWebView);
  assert.match(contentSecurityPolicy(), /https:\/\/api\.nal\.usda\.gov/);
});
