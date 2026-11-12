import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRecipe, urlFrom } from '../lib/recipeExtract';

const page = (json: unknown, extra = '') => `<html><head><title>Best Pancakes | Some Site</title><script type="application/ld+json">${JSON.stringify(json)}</script>${extra}</head><body>story…</body></html>`;

test('a recipe in structured data gives name, servings, ingredients and nutrition', () => {
  const r = extractRecipe(
    page({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'x' },
        {
          '@type': ['Recipe'],
          name: 'Fluffy &amp; Easy Pancakes',
          recipeYield: ['8', '4 servings'],
          recipeIngredient: ['1 1/2 cups all-purpose flour', '2&nbsp;large eggs', ' 1 tbsp sugar '],
          nutrition: { '@type': 'NutritionInformation', calories: '310 calories', proteinContent: '8 g', carbohydrateContent: '45 g', fatContent: '10 g', sodiumContent: '0.4 g' },
        },
      ],
    })
  );
  assert.ok(r);
  assert.equal(r.name, 'Fluffy & Easy Pancakes');
  assert.equal(r.servings, 4);
  assert.deepEqual(r.lines, ['1 1/2 cups all-purpose flour', '2 large eggs', '1 tbsp sugar']);
  assert.equal(r.nutrition?.kcal, 310);
  assert.equal(r.nutrition?.sodium, 400);
});

test('a bare number or text yield is read, and a page with no recipe gives null', () => {
  assert.equal(extractRecipe(page({ '@type': 'Recipe', name: 'A', recipeYield: 6, recipeIngredient: ['1 egg'] }))?.servings, 6);
  assert.equal(extractRecipe(page({ '@type': 'Recipe', name: 'A', recipeYield: '12 muffins', recipeIngredient: ['1 egg'] }))?.servings, 12);
  assert.equal(extractRecipe(page({ '@type': 'Article', name: 'A' })), null);
  assert.equal(extractRecipe('<html>nothing</html>'), null);
  assert.equal(extractRecipe(page({ '@type': 'Recipe', name: 'A', recipeIngredient: [] })), null);
});

test('microdata pages still give ingredients', () => {
  const r = extractRecipe('<title>Soup</title><ul><li itemprop="recipeIngredient">2 carrots</li><li itemprop="recipeIngredient">1 onion</li></ul>');
  assert.deepEqual(r?.lines, ['2 carrots', '1 onion']);
});

test('the address is taken from pasted text and upgraded to https', () => {
  assert.equal(urlFrom('look: http://example.com/r/1?x=2#top, nice'), 'https://example.com/r/1?x=2');
  assert.equal(urlFrom('no link here'), null);
  assert.equal(urlFrom('https://localhost/x'), null);
  assert.equal(urlFrom('https://me:pw@example.com/'), null);
});
