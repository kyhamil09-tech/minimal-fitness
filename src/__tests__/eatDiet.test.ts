import test from 'node:test';
import assert from 'node:assert/strict';
import { NO_DIET, avoidWords, dietActive, dietLabel, fitsDiet, normalizeDiet } from '../eat/diet';

const d = (over: Partial<typeof NO_DIET>) => ({ ...NO_DIET, ...over });

test('with no diet chosen everything fits, and the label says what is on', () => {
  assert.equal(dietActive(NO_DIET), false);
  assert.equal(fitsDiet({ name: 'Bacon cheeseburger' }, NO_DIET), true);
  assert.equal(dietLabel(d({ vegetarian: true, glutenFree: true, avoid: 'soy, shellfish' })), 'vegetarian, gluten-free, no soy, no shellfish');
  assert.deepEqual(avoidWords(d({ avoid: ' Soy ,, x, shellfish ' })), ['soy', 'shellfish']);
  assert.equal(normalizeDiet({ vegan: true, avoid: 5 as never }).avoid, '');
});

test('vegetarian leaves out meat, poultry and fish by group and by name, but not veggie versions', () => {
  const v = d({ vegetarian: true });
  assert.equal(fitsDiet({ name: 'Chicken burrito bowl' }, v), false);
  assert.equal(fitsDiet({ name: 'Anything', group: 3 }, v), false);
  assert.equal(fitsDiet({ name: 'Smoked salmon' }, v), false);
  assert.equal(fitsDiet({ name: 'Tuna salad' }, v), false);
  assert.equal(fitsDiet({ name: 'Veggie burger' }, v), true);
  assert.equal(fitsDiet({ name: 'Lentil soup' }, v), true);
  assert.equal(fitsDiet({ name: 'Greek yogurt', group: 1 }, v), true);
  assert.equal(fitsDiet({ name: 'Eggs', group: 2 }, v), true);
});

test('vegan also leaves out dairy, eggs and honey, but plant milks are fine', () => {
  const v = d({ vegan: true });
  assert.equal(fitsDiet({ name: 'Greek yogurt', group: 1 }, v), false);
  assert.equal(fitsDiet({ name: 'Scrambled eggs' }, v), false);
  assert.equal(fitsDiet({ name: 'Honey' }, v), false);
  assert.equal(fitsDiet({ name: 'Cheddar cheese' }, v), false);
  assert.equal(fitsDiet({ name: 'Oat milk' }, v), true);
  assert.equal(fitsDiet({ name: 'Peanut butter' }, v), true);
  assert.equal(fitsDiet({ name: 'Coconut cream' }, v), true);
  assert.equal(fitsDiet({ name: 'Ice cream' }, v), false);
});

test('dairy-free leaves out dairy but not butter-named nut spreads or plant milks', () => {
  const f = d({ dairyFree: true });
  assert.equal(fitsDiet({ name: 'Whole milk', group: 1 }, f), false);
  assert.equal(fitsDiet({ name: 'Butter' }, f), false);
  assert.equal(fitsDiet({ name: 'Almond butter' }, f), true);
  assert.equal(fitsDiet({ name: 'Soy milk' }, f), true);
  assert.equal(fitsDiet({ name: 'Chicken breast' }, f), true);
});

test('gluten-free leaves out wheat foods and bread, but keeps rice noodles, corn tortillas and anything labeled gluten free', () => {
  const g = d({ glutenFree: true });
  assert.equal(fitsDiet({ name: 'Spaghetti with tomato sauce' }, g), false);
  assert.equal(fitsDiet({ name: 'Whole wheat bread', group: 7 }, g), false);
  assert.equal(fitsDiet({ name: 'Chocolate cake' }, g), false);
  assert.equal(fitsDiet({ name: 'Rice noodles' }, g), true);
  assert.equal(fitsDiet({ name: 'Corn tortilla' }, g), true);
  assert.equal(fitsDiet({ name: 'Almond flour' }, g), true);
  assert.equal(fitsDiet({ name: 'Gluten free bread', group: 7 }, g), true);
  assert.equal(fitsDiet({ name: 'Grilled chicken' }, g), true);
});

test('nut-free spots nuts and peanut butter but not coconut or nutmeg', () => {
  const n = d({ nutFree: true });
  assert.equal(fitsDiet({ name: 'Almonds' }, n), false);
  assert.equal(fitsDiet({ name: 'Peanut butter' }, n), false);
  assert.equal(fitsDiet({ name: 'Walnut brownie' }, n), false);
  assert.equal(fitsDiet({ name: 'Coconut milk' }, n), true);
  assert.equal(fitsDiet({ name: 'Butternut squash soup' }, n), true);
  assert.equal(fitsDiet({ name: 'Nutmeg' }, n), true);
  assert.equal(fitsDiet({ name: 'Coconut and almond bar' }, n), false);
});

test('your own words to avoid, whole words only', () => {
  const a = d({ avoid: 'shellfish, soy sauce' });
  assert.equal(fitsDiet({ name: 'Shellfish platter' }, a), false);
  assert.equal(fitsDiet({ name: 'Fried rice with soy sauce' }, a), false);
  assert.equal(fitsDiet({ name: 'Soy milk' }, a), true);
  assert.equal(fitsDiet({ name: 'Rice' }, a), true);
});
