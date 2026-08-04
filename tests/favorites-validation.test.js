'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const registerFavoriteRoutes = require('../routes/favorites.js');

function createFakeApp() {
  const routes = {};
  return {
    routes,
    post(path, ...handlers) { routes[`POST ${path}`] = handlers; },
    get(path, ...handlers) { routes[`GET ${path}`] = handlers; },
    delete(path, ...handlers) { routes[`DELETE ${path}`] = handlers; },
  };
}

function createFakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function runHandler(handlers, req) {
  const res = createFakeRes();
  for (const handler of handlers) {
    let calledNext = false;
    await handler(req, res, () => { calledNext = true; });
    if (!calledNext) break;
  }
  return res;
}

describe('POST /api/favorites validation', () => {
  let app;
  let savedCalls;

  beforeEach(() => {
    app = createFakeApp();
    savedCalls = [];
    const db = {
      async saveFavorite(id, userId, mealKey, safeMeal) {
        savedCalls.push({ id, userId, mealKey, safeMeal });
      },
    };
    const requireSession = (req, res, next) => next();
    registerFavoriteRoutes(app, { requireSession, db });
  });

  test('rejects a missing meal payload', async () => {
    const res = await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: {},
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /meal object required/);
    assert.equal(savedCalls.length, 0);
  });

  test('rejects a non-object meal payload', async () => {
    const res = await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: { meal: 'not-an-object' },
    });
    assert.equal(res.statusCode, 400);
  });

  test('rejects an array passed as meal', async () => {
    const res = await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: { meal: [1, 2, 3] },
    });
    assert.equal(res.statusCode, 400);
  });

  test('rejects a meal with an empty name', async () => {
    const res = await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: { meal: { name: '   ' } },
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /meal.name required/);
  });

  test('rejects a meal with no name field', async () => {
    const res = await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: { meal: { calories: 400 } },
    });
    assert.equal(res.statusCode, 400);
  });

  test('lowercases and trims the meal name into the meal key', async () => {
    const res = await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: { meal: { name: '  Grilled Chicken Bowl  ' } },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.mealKey, 'grilled chicken bowl');
  });

  test('strips fields not in the allowlist', async () => {
    await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' },
      body: { meal: { name: 'Test Meal', isAdmin: true, extra: 'nope' } },
    });
    const saved = savedCalls[0].safeMeal;
    assert.equal(saved.isAdmin, undefined);
    assert.equal(saved.extra, undefined);
  });

  test('truncates an overlong meal name to 120 chars', async () => {
    const longName = 'a'.repeat(300);
    await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: { meal: { name: longName } },
    });
    assert.equal(savedCalls[0].safeMeal.name.length, 120);
  });

  test('truncates an overlong description to 500 chars', async () => {
    await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: { meal: { name: 'Soup', description: 'x'.repeat(900) } },
    });
    assert.equal(savedCalls[0].safeMeal.description.length, 500);
  });

  test('coerces non-string field values to empty strings instead of throwing', async () => {
    await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: { meal: { name: 'Soup', description: { evil: true } } },
    });
    assert.equal(savedCalls[0].safeMeal.description, '');
  });

  test('coerces non-numeric macro fields to 0 instead of NaN', async () => {
    await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' },
      body: { meal: { name: 'Soup', calories: 'lots', protein: null, carbs: undefined, fat: {} } },
    });
    const saved = savedCalls[0].safeMeal;
    assert.equal(saved.calories, 0);
    assert.equal(saved.protein, 0);
    assert.equal(saved.carbs, 0);
    assert.equal(saved.fat, 0);
  });

  test('preserves valid numeric macro fields', async () => {
    await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' },
      body: { meal: { name: 'Soup', calories: 450, protein: 30, carbs: 40, fat: 12 } },
    });
    const saved = savedCalls[0].safeMeal;
    assert.equal(saved.calories, 450);
    assert.equal(saved.protein, 30);
    assert.equal(saved.carbs, 40);
    assert.equal(saved.fat, 12);
  });

  test('defaults type to "meal" when missing, but preserves "custom" for custom meals', async () => {
    const res1 = await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: { meal: { name: 'Soup' } },
    });
    assert.equal(savedCalls[0].safeMeal.type, 'meal');

    await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: { meal: { name: 'My Custom Meal', type: 'custom' } },
    });
    assert.equal(savedCalls[1].safeMeal.type, 'custom');
    assert.equal(res1.statusCode, 200);
  });

  test('caps ingredients list at 30 entries and sanitizes each one', async () => {
    const ingredients = Array.from({ length: 40 }, (_, i) => ({
      name: `Ingredient ${i}`, amount: '1 cup', cost: 1.5,
    }));
    await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: { meal: { name: 'Big Meal', ingredients } },
    });
    const saved = savedCalls[0].safeMeal;
    assert.equal(saved.ingredients.length, 30);
    assert.equal(saved.ingredients[0].name, 'Ingredient 0');
  });

  test('ignores a non-array ingredients field instead of throwing', async () => {
    await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: { meal: { name: 'Soup', ingredients: 'not an array' } },
    });
    assert.deepEqual(savedCalls[0].safeMeal.ingredients, []);
  });

  test('tolerates malformed ingredient entries (null, non-object)', async () => {
    await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' },
      body: { meal: { name: 'Soup', ingredients: [null, 'string-ingredient', 42, { name: 'Salt' }] } },
    });
    const saved = savedCalls[0].safeMeal.ingredients;
    assert.equal(saved.length, 4);
    assert.equal(saved[0].name, '');
    assert.equal(saved[3].name, 'Salt');
  });

  test('caps instructions list at 20 entries and truncates each step to 300 chars', async () => {
    const instructions = Array.from({ length: 25 }, (_, i) => `Step ${i} `.repeat(50));
    await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: { meal: { name: 'Soup', instructions } },
    });
    const saved = savedCalls[0].safeMeal.instructions;
    assert.equal(saved.length, 20);
    assert.ok(saved[0].length <= 300);
  });

  test('escapes-free storage still preserves raw HTML/script-like text within length limits (sanitisation is length-only, not HTML-escaping)', async () => {
    await runHandler(app.routes['POST /api/favorites'], {
      session: { userId: 'u1' }, body: { meal: { name: '<script>alert(1)</script>' } },
    });
    assert.equal(savedCalls[0].safeMeal.name, '<script>alert(1)</script>');
  });
});
