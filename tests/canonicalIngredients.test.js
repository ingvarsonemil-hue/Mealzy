'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeName,
  resolveIngredient,
  getById,
  allCanonicalIngredients,
  MATCH,
} = require('../canonicalIngredients.js');
const { CANONICAL_INGREDIENTS, VALID_BASE_UNITS, VALID_CATEGORIES } = require('../canonicalIngredientData.js');

describe('resolveIngredient — normalization', () => {
  test('exact canonical name resolves', () => {
    const r = resolveIngredient('chicken breast');
    assert.equal(r.resolved, true);
    assert.equal(r.ingredient.id, 'chicken_breast');
    assert.equal(r.matchedVia, MATCH.CANONICAL_NAME);
  });

  test('case differences resolve', () => {
    for (const input of ['Chicken Breast', 'CHICKEN BREAST', 'ChIcKeN bReAsT']) {
      const r = resolveIngredient(input);
      assert.equal(r.resolved, true, input);
      assert.equal(r.ingredient.id, 'chicken_breast', input);
    }
  });

  test('leading/trailing whitespace resolves', () => {
    const r = resolveIngredient('   chicken breast\t\n ');
    assert.equal(r.resolved, true);
    assert.equal(r.ingredient.id, 'chicken_breast');
  });

  test('repeated internal whitespace resolves', () => {
    const r = resolveIngredient('chicken     breast');
    assert.equal(r.resolved, true);
    assert.equal(r.ingredient.id, 'chicken_breast');
    assert.equal(r.normalized, 'chicken breast');
  });

  test('tabs/newlines between words normalize to a single space', () => {
    const r = resolveIngredient('olive\t\noil');
    assert.equal(r.resolved, true);
    assert.equal(r.ingredient.id, 'olive_oil');
  });

  test('normalizeName lowercases, trims and collapses whitespace', () => {
    assert.equal(normalizeName('  Red   Lentils '), 'red lentils');
    assert.equal(normalizeName('SALT'), 'salt');
  });

  test('normalizeName returns null for non-strings and blank input', () => {
    for (const bad of [null, undefined, 42, {}, [], true, '', '   ', '\t\n']) {
      assert.equal(normalizeName(bad), null);
    }
  });
});

describe('resolveIngredient — alias matching', () => {
  test('known curated alias resolves to its canonical ingredient', () => {
    const r = resolveIngredient('beef mince');
    assert.equal(r.resolved, true);
    assert.equal(r.ingredient.id, 'ground_beef');
    assert.equal(r.ingredient.canonicalName, 'ground beef');
    assert.equal(r.matchedVia, MATCH.ALIAS);
  });

  test('alias resolution also normalizes casing/whitespace', () => {
    const r = resolveIngredient('  Garbanzo   Beans ');
    assert.equal(r.resolved, true);
    assert.equal(r.ingredient.id, 'canned_chickpeas');
    assert.equal(r.matchedVia, MATCH.ALIAS);
  });

  test('ingredientPriceData curated aliases all resolve here too', () => {
    const cases = [
      ['beef mince', 'ground_beef'],
      ['capsicum', 'bell_peppers'],
      ['aubergine', 'eggplant'],
      ['sea salt', 'salt'],
      ['black pepper', 'pepper'],
    ];
    for (const [input, expectedId] of cases) {
      const r = resolveIngredient(input);
      assert.equal(r.resolved, true, input);
      assert.equal(r.ingredient.id, expectedId, input);
    }
  });
});

describe('resolveIngredient — unresolved / unsafe input', () => {
  test('unknown ingredient returns unresolved (never invents one)', () => {
    const r = resolveIngredient('dragonfruit compote');
    assert.equal(r.resolved, false);
    assert.equal(r.ingredient, null);
    assert.equal(r.matchedVia, MATCH.UNRESOLVED);
    assert.equal(r.normalized, 'dragonfruit compote');
  });

  test('empty / whitespace-only input returns unresolved safely', () => {
    for (const input of ['', '   ', '\t\n  ']) {
      const r = resolveIngredient(input);
      assert.equal(r.resolved, false, JSON.stringify(input));
      assert.equal(r.ingredient, null);
      assert.equal(r.normalized, null);
    }
  });

  test('invalid (non-string) input returns unresolved without throwing', () => {
    for (const input of [null, undefined, 0, 123, {}, [], true, NaN, () => {}]) {
      const r = resolveIngredient(input);
      assert.equal(r.resolved, false);
      assert.equal(r.ingredient, null);
      assert.equal(r.normalized, null);
    }
  });
});

describe('resolveIngredient — ambiguity / overmatching protection', () => {
  test('"chicken" does not resolve to "chicken breast" or "chicken thighs"', () => {
    const r = resolveIngredient('chicken');
    assert.equal(r.resolved, false);
    assert.equal(r.ingredient, null);
  });

  test('"chicken breast" and "chicken thighs" resolve to distinct ingredients', () => {
    const breast = resolveIngredient('chicken breast');
    const thighs = resolveIngredient('chicken thighs');
    assert.equal(breast.resolved, true);
    assert.equal(thighs.resolved, true);
    assert.notEqual(breast.ingredient.id, thighs.ingredient.id);
  });

  test('substring of a canonical name does not match it', () => {
    // "rice" IS its own canonical ingredient, but "brown" / "white" prefixes
    // must not be dropped, and a partial like "len" must not hit "red lentils".
    assert.equal(resolveIngredient('brown').resolved, false);
    assert.equal(resolveIngredient('len').resolved, false);
    assert.equal(resolveIngredient('lentils').resolved, false);
    assert.equal(resolveIngredient('white rice').ingredient.id, 'white_rice');
    assert.equal(resolveIngredient('brown rice').ingredient.id, 'brown_rice');
    assert.equal(resolveIngredient('rice').ingredient.id, 'rice');
  });

  test('a longer string containing a canonical name does not match it', () => {
    // "salt" is canonical; "roasted salted almonds" must not resolve to "salt".
    assert.equal(resolveIngredient('roasted salted almonds').resolved, false);
    assert.equal(resolveIngredient('salt').ingredient.id, 'salt');
    // Phase 3C: the combined "salt and pepper" identity was removed — it is
    // now UNRESOLVED (generation lists salt and pepper as two lines).
    assert.equal(resolveIngredient('salt and pepper').resolved, false);
    assert.equal(resolveIngredient('salt & pepper').resolved, false);
    assert.equal(resolveIngredient('salt and black pepper').resolved, false);
  });

  test('distinct-but-related foods stay separate', () => {
    const pairs = [
      ['potato', 'sweet potato'],
      ['lemon', 'lemon juice'],
      ['lime', 'lime juice'],
      ['tomato', 'canned tomatoes'],
      ['greek yogurt', 'plain yogurt'],
      ['salmon fillets', 'cod fillet'],
      ['vegetable broth', 'chicken broth'],
      ['white rice', 'brown rice'],
    ];
    for (const [a, b] of pairs) {
      const ra = resolveIngredient(a);
      const rb = resolveIngredient(b);
      assert.equal(ra.resolved, true, a);
      assert.equal(rb.resolved, true, b);
      assert.notEqual(ra.ingredient.id, rb.ingredient.id, `${a} vs ${b}`);
    }
  });
});

describe('resolveIngredient — determinism', () => {
  test('same input always produces the same result', () => {
    const inputs = ['chicken breast', ' Beef  Mince ', 'unknownthing', '', null];
    for (const input of inputs) {
      const first = JSON.stringify(resolveIngredient(input));
      for (let i = 0; i < 25; i++) {
        assert.equal(JSON.stringify(resolveIngredient(input)), first, JSON.stringify(input));
      }
    }
  });

  test('resolved records are frozen (cannot be mutated by callers)', () => {
    const r = resolveIngredient('chicken breast');
    assert.throws(() => { r.ingredient.canonicalName = 'x'; });
    assert.ok(Object.isFrozen(r));
    assert.ok(Object.isFrozen(r.ingredient));
    assert.ok(Object.isFrozen(r.ingredient.aliases));
  });
});

describe('canonical dataset integrity', () => {
  const records = allCanonicalIngredients();

  test('dataset is non-empty and exposed in data-file order', () => {
    assert.ok(records.length > 0);
    assert.equal(records.length, CANONICAL_INGREDIENTS.length);
    assert.deepEqual(records.map(r => r.id), CANONICAL_INGREDIENTS.map(r => r.id));
  });

  test('every canonical id is unique', () => {
    const ids = records.map(r => r.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('every canonical id is a stable human-readable snake_case slug', () => {
    for (const r of records) {
      assert.match(r.id, /^[a-z0-9]+(_[a-z0-9]+)*$/, r.id);
    }
  });

  test('every canonical name is unique after normalization', () => {
    const names = records.map(r => normalizeName(r.canonicalName));
    assert.ok(names.every(n => n !== null));
    assert.equal(new Set(names).size, names.length);
  });

  test('every record has a valid id, canonicalName, category and baseUnit', () => {
    for (const r of records) {
      assert.equal(typeof r.id, 'string');
      assert.ok(r.id.length > 0, r.id);
      assert.equal(typeof r.canonicalName, 'string');
      assert.equal(r.canonicalName, normalizeName(r.canonicalName), r.id);
      assert.ok(VALID_CATEGORIES.includes(r.category), `${r.id} category=${r.category}`);
      assert.ok(VALID_BASE_UNITS.includes(r.baseUnit), `${r.id} baseUnit=${r.baseUnit}`);
      assert.ok(Array.isArray(r.aliases), r.id);
    }
  });

  test('aliases do not collide across different canonical ingredients', () => {
    const seen = new Map();
    for (const r of records) {
      for (const alias of r.aliases) {
        const norm = normalizeName(alias);
        assert.ok(norm, `${r.id} has empty alias`);
        if (seen.has(norm)) {
          assert.equal(seen.get(norm), r.id, `alias "${norm}" shared by ${seen.get(norm)} and ${r.id}`);
        }
        seen.set(norm, r.id);
      }
    }
  });

  test('no alias equals any canonical name', () => {
    const canonicalNames = new Set(records.map(r => normalizeName(r.canonicalName)));
    for (const r of records) {
      for (const alias of r.aliases) {
        assert.equal(canonicalNames.has(normalizeName(alias)), false, `alias "${alias}" on ${r.id} equals a canonical name`);
      }
    }
  });

  test('every canonical name and alias resolves back to its own record', () => {
    for (const r of records) {
      const byName = resolveIngredient(r.canonicalName);
      assert.equal(byName.resolved, true, r.canonicalName);
      assert.equal(byName.ingredient.id, r.id);
      for (const alias of r.aliases) {
        const byAlias = resolveIngredient(alias);
        assert.equal(byAlias.resolved, true, alias);
        assert.equal(byAlias.ingredient.id, r.id, alias);
      }
    }
  });

  test('the existing ingredientPriceData vocabulary is covered', () => {
    // Every PRICES row name and every ALIASES entry from ingredientPriceData.js
    // must resolve — this dataset is a superset of the current Mealzy pricing
    // vocabulary, not a separate taxonomy.
    const { PRICES, ALIASES } = require('../ingredientPriceData.js');
    // Phase 3C: a small set of entries are DELIBERATELY price-only (legacy /
    // free-text pricing compatibility) with no canonical identity — canonical
    // nutrition resolution and legacy free-text pricing are allowed to differ.
    const PRICE_ONLY = new Set(['salt and pepper', 'lean chuck meat']);
    for (const row of PRICES) {
      if (PRICE_ONLY.has(row.name)) continue;
      const r = resolveIngredient(row.name);
      assert.equal(r.resolved, true, `price row "${row.name}" is not covered by canonical data`);
    }
    for (const a of ALIASES) {
      if (PRICE_ONLY.has(a.alias)) continue;
      const r = resolveIngredient(a.alias);
      assert.equal(r.resolved, true, `price alias "${a.alias}" is not covered by canonical data`);
    }
  });

  test('getById returns the frozen record or null', () => {
    assert.equal(getById('chicken_breast').canonicalName, 'chicken breast');
    assert.equal(getById('nope_not_real'), null);
  });
});
