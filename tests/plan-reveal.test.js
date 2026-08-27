'use strict';

// Runs the REAL public/js/plan-reveal.js source (not a reimplementation)
// inside a sandboxed VM context, mirroring the pattern in
// tests/grocery-list-planid-flow.test.js. A minimal DOM stub is enough here
// because plan-reveal.js's click handling only calls `e.target.closest(...)`
// — tests fire that handler directly with a synthetic target, so no real
// DOM/jsdom dependency is needed.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plan-reveal.js'), 'utf8');

function makeSandbox() {
  const trackCalls = [];
  const appended = [];
  let removedCount = 0;

  function makeEl() {
    const listeners = {};
    return {
      className: '',
      innerHTML: '',
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return this.attrs[k]; },
      addEventListener(type, fn) { listeners[type] = fn; },
      _fireClick(target) { if (listeners.click) listeners.click({ target }); },
      remove() { removedCount++; },
    };
  }

  const bodyClassList = new Set();
  const documentStub = {
    body: {
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return this.attrs[k]; },
      classList: { add: (c) => bodyClassList.add(c), remove: (c) => bodyClassList.delete(c), has: (c) => bodyClassList.has(c) },
      appendChild(el) { appended.push(el); },
    },
    createElement() { return makeEl(); },
    _keydownHandlers: [],
    addEventListener(type, fn) { if (type === 'keydown') this._keydownHandlers.push(fn); },
    removeEventListener(type, fn) {
      if (type === 'keydown') this._keydownHandlers = this._keydownHandlers.filter((h) => h !== fn);
    },
  };

  const sandbox = {
    document: documentStub,
    location: { pathname: '/dashboard.html', href: '' },
    mealzyTrack: (event, data) => trackCalls.push({ event, data }),
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'plan-reveal.js' });
  return { sandbox, trackCalls, appended, removedCountRef: () => removedCount, bodyClassList };
}

// A realistic /api/generate-meal week-mode response shape (server.js:2827),
// trimmed to the fields plan-reveal.js actually reads.
function validData(overrides) {
  return Object.assign(
    {
      success: true,
      weekStart: '2026-08-24',
      planId: 'plan-abc-123',
      days: [
        { date: '2026-08-24', meals: [
          { name: 'Greek Yogurt Bowl', type: 'breakfast', calories: 420, protein: 32, image_url: 'https://img.example/1.jpg' },
          { name: 'Chicken Burrito Bowl', type: 'lunch', calories: 610, protein: 45, image_url: 'https://img.example/2.jpg' },
          { name: 'Salmon & Rice', type: 'dinner', calories: 700, protein: 48 },
          { name: 'Almonds & Apple', type: 'snack', calories: 220, protein: 6 },
        ] },
        { date: '2026-08-25', meals: [
          { name: 'Oatmeal', type: 'breakfast', calories: 380, protein: 18 },
        ] },
      ],
      weeklyTotals: { avgCalories: 2150.4, avgProtein: 164.6, totalCost: 68.32, budgetStatus: 'certified' },
    },
    overrides
  );
}

describe('buildRevealModel — only the real server response ever produces a model', () => {
  test('valid week-mode/logged-in response builds a model using weeklyTotals verbatim', () => {
    const { sandbox } = makeSandbox();
    const model = sandbox.window.PlanReveal.buildRevealModel(validData());
    assert.ok(model);
    assert.equal(model.calories, 2150); // Math.round(2150.4) — same value, no independent recompute
    assert.equal(model.protein, 165);   // Math.round(164.6)
    assert.equal(model.cost, 68.32);    // totalCost, untouched
    assert.equal(model.days, 2);
    assert.equal(model.totalMeals, 5);  // real sum across days[].meals, not a hardcoded "21"
  });

  test('missing planId (anonymous generation never gets one) -> no reveal', () => {
    const { sandbox } = makeSandbox();
    const data = validData({ planId: undefined });
    assert.equal(sandbox.window.PlanReveal.buildRevealModel(data), null);
  });

  test('single-day/trial response (no days array) -> no reveal', () => {
    const { sandbox } = makeSandbox();
    const data = { success: true, planId: 'p1', date: '2026-08-24', mealPlan: { meals: [] } };
    assert.equal(sandbox.window.PlanReveal.buildRevealModel(data), null);
  });

  test('failed generation (success: false) -> no reveal', () => {
    const { sandbox } = makeSandbox();
    const data = validData({ success: false });
    assert.equal(sandbox.window.PlanReveal.buildRevealModel(data), null);
  });

  test('malformed weeklyTotals (missing avgCalories) -> no reveal, no fabricated fallback', () => {
    const { sandbox } = makeSandbox();
    const data = validData({ weeklyTotals: { avgProtein: 165, totalCost: 68 } });
    assert.equal(sandbox.window.PlanReveal.buildRevealModel(data), null);
  });

  test('weeklyTotals present but days have zero meals -> no reveal', () => {
    const { sandbox } = makeSandbox();
    const data = validData({ days: [{ date: '2026-08-24', meals: [] }] });
    assert.equal(sandbox.window.PlanReveal.buildRevealModel(data), null);
  });

  test('null/undefined response -> no reveal', () => {
    const { sandbox } = makeSandbox();
    assert.equal(sandbox.window.PlanReveal.buildRevealModel(null), null);
    assert.equal(sandbox.window.PlanReveal.buildRevealModel(undefined), null);
  });
});

describe('budget truthfulness', () => {
  test('cost is always labeled an estimate, never presented as exact/guaranteed', () => {
    const { sandbox, appended } = makeSandbox();
    sandbox.window.PlanReveal.show(validData(), 'dashboard');
    const html = appended[0].innerHTML;
    assert.match(html, /~\$68/);
    assert.match(html, /est\. groceries/i);
    assert.doesNotMatch(html, /\btotal\b/i);
    assert.doesNotMatch(html, /guarantee/i);
    assert.doesNotMatch(html, /exact/i);
    assert.doesNotMatch(html, /perfect/i);
  });

  test('certified status shows no extra caveat text', () => {
    const { sandbox, appended } = makeSandbox();
    sandbox.window.PlanReveal.show(validData({ weeklyTotals: { avgCalories: 2000, avgProtein: 150, totalCost: 60, budgetStatus: 'certified' } }), 'dashboard');
    assert.doesNotMatch(appended[0].innerHTML, /plan-reveal-caveat/);
  });

  test('estimated_with_unknowns surfaces an uncertainty caveat', () => {
    const { sandbox, appended } = makeSandbox();
    sandbox.window.PlanReveal.show(validData({ weeklyTotals: { avgCalories: 2000, avgProtein: 150, totalCost: 60, budgetStatus: 'estimated_with_unknowns' } }), 'dashboard');
    assert.match(appended[0].innerHTML, /prices estimated/i);
  });

  test('over_budget is disclosed, not hidden', () => {
    const { sandbox, appended } = makeSandbox();
    sandbox.window.PlanReveal.show(validData({ weeklyTotals: { avgCalories: 2000, avgProtein: 150, totalCost: 90, budgetStatus: 'over_budget' } }), 'dashboard');
    assert.match(appended[0].innerHTML, /over your grocery budget/i);
  });

  test('missing budget status fails neutral — no caveat, no implied certification', () => {
    const { sandbox, appended } = makeSandbox();
    sandbox.window.PlanReveal.show(validData({ weeklyTotals: { avgCalories: 2000, avgProtein: 150, totalCost: 60 } }), 'dashboard');
    assert.doesNotMatch(appended[0].innerHTML, /plan-reveal-caveat/);
  });
});

describe('real meal data populates the preview', () => {
  test('preview uses real meal names from data.days[].meals, not placeholders', () => {
    const { sandbox, appended } = makeSandbox();
    sandbox.window.PlanReveal.show(validData(), 'dashboard');
    const html = appended[0].innerHTML;
    assert.match(html, /Greek Yogurt Bowl/);
    assert.match(html, /Chicken Burrito Bowl/);
  });
});

describe('meal-image truthfulness — a photo only ever appears for the meal it belongs to', () => {
  const STOCK = ['unsplash.com', 'pexels', 'foodiesfeed', 'images.stock'];

  test('a real image_url is rendered as an <img> for that meal', () => {
    const { sandbox } = makeSandbox();
    const model = sandbox.window.PlanReveal.buildRevealModel(validData());
    const withImg = model.preview.find((m) => m.name === 'Greek Yogurt Bowl');
    assert.equal(withImg.image, 'https://img.example/1.jpg');

    const { sandbox: s2, appended } = makeSandbox();
    s2.window.PlanReveal.show(validData(), 'dashboard');
    assert.match(appended[0].innerHTML, /<img src="https:\/\/img\.example\/1\.jpg"/);
  });

  test('a meal with no image_url gets image:null — never a substituted stock photo', () => {
    const { sandbox } = makeSandbox();
    const model = sandbox.window.PlanReveal.buildRevealModel(validData());
    const salmon = model.preview.find((m) => m.name === 'Salmon & Rice');
    assert.equal(salmon.image, null);
    assert.equal(model.preview.some((m) => m.image && STOCK.some((s) => m.image.includes(s))), false);
  });

  test('a non-http image_url (garbage / relative / data:) is rejected, not rendered', () => {
    const { sandbox } = makeSandbox();
    for (const bad of ['', 'not a url', '/local/pic.jpg', 'data:image/png;base64,AAAA', 42, null]) {
      const data = validData({
        days: [{ date: '2026-08-24', meals: [{ name: 'X', type: 'lunch', image_url: bad }] }],
        weeklyTotals: { avgCalories: 2000, avgProtein: 150, totalCost: 60, budgetStatus: 'certified' },
      });
      const model = sandbox.window.PlanReveal.buildRevealModel(data);
      assert.equal(model.preview[0].image, null);
    }
  });

  test('the no-photo card still shows the meal name (and its type when present)', () => {
    const { sandbox, appended } = makeSandbox();
    sandbox.window.PlanReveal.show(validData(), 'dashboard');
    const html = appended[0].innerHTML;
    assert.match(html, /plan-reveal-thumb-noimg/);
    assert.match(html, /plan-reveal-thumb-title">Salmon &amp; Rice</);
    assert.match(html, /plan-reveal-thumb-type">Dinner</); // Salmon & Rice is type: 'dinner'
  });

  test('no <img> tag anywhere when the whole plan came back imageless', () => {
    const imageless = validData({
      days: [{ date: '2026-08-24', meals: [
        { name: 'Oat Bowl', type: 'breakfast' },
        { name: 'Big Salad', type: 'lunch' },
      ] }],
      weeklyTotals: { avgCalories: 2000, avgProtein: 150, totalCost: 60, budgetStatus: 'certified' },
    });
    const { sandbox, appended } = makeSandbox();
    sandbox.window.PlanReveal.show(imageless, 'dashboard');
    assert.doesNotMatch(appended[0].innerHTML, /<img/);
    assert.match(appended[0].innerHTML, /Oat Bowl/);
    assert.match(appended[0].innerHTML, /Big Salad/);
  });

  test('meals that DO carry a photo still sort ahead of the no-photo cards', () => {
    const { sandbox } = makeSandbox();
    const model = sandbox.window.PlanReveal.buildRevealModel(validData());
    const firstNull = model.preview.findIndex((m) => m.image === null);
    const lastImg = model.preview.map((m) => !!m.image).lastIndexOf(true);
    assert.ok(firstNull > lastImg, 'all image cards come before any no-photo card');
  });
});

describe('show() gating and dedupe', () => {
  test('never shows twice for the same generation (same planId)', () => {
    const { sandbox, appended } = makeSandbox();
    const data = validData();
    assert.equal(sandbox.window.PlanReveal.show(data, 'dashboard'), true);
    assert.equal(sandbox.window.PlanReveal.show(data, 'dashboard'), false); // duplicate invocation
    assert.equal(appended.length, 1);
  });

  test('malformed data never renders anything, even on repeated calls', () => {
    const { sandbox, appended } = makeSandbox();
    assert.equal(sandbox.window.PlanReveal.show({ success: false }, 'dashboard'), false);
    assert.equal(sandbox.window.PlanReveal.show({}, 'dashboard'), false);
    assert.equal(appended.length, 0);
  });

  test('works identically from both entry points, tagging the source', () => {
    const { sandbox: s1, appended: a1 } = makeSandbox();
    s1.window.PlanReveal.show(validData({ planId: 'plan-dash' }), 'dashboard');
    assert.equal(a1[0].attrs === undefined, false);

    const { sandbox: s2, appended: a2 } = makeSandbox();
    s2.window.PlanReveal.show(validData({ planId: 'plan-planner' }), 'meal-planner');
    assert.ok(a2.length === 1);
  });
});

describe('CTA / dismiss behavior', () => {
  test('primary CTA navigates to the Meal Planner when not already there', () => {
    const { sandbox, appended, trackCalls } = makeSandbox();
    sandbox.window.PlanReveal.show(validData(), 'dashboard');
    appended[0]._fireClick({ closest: (sel) => (sel === '[data-action]' ? { getAttribute: () => 'view-plan' } : null) });
    assert.equal(sandbox.location.href, 'meal-planner.html');
    assert.ok(trackCalls.some((c) => c.event === 'plan_reveal_cta_view_plan'));
  });

  test('primary CTA just dismisses (no navigation) when already on the Meal Planner', () => {
    const { sandbox, appended, removedCountRef } = makeSandbox();
    sandbox.location.pathname = '/meal-planner.html';
    sandbox.window.PlanReveal.show(validData(), 'meal-planner');
    appended[0]._fireClick({ closest: (sel) => (sel === '[data-action]' ? { getAttribute: () => 'view-plan' } : null) });
    assert.equal(sandbox.location.href, '');
    assert.equal(removedCountRef(), 1);
  });

  test('grocery CTA navigates to grocery-list.html', () => {
    const { sandbox, appended, trackCalls } = makeSandbox();
    sandbox.window.PlanReveal.show(validData(), 'dashboard');
    appended[0]._fireClick({ closest: (sel) => (sel === '[data-action]' ? { getAttribute: () => 'view-groceries' } : null) });
    assert.equal(sandbox.location.href, 'grocery-list.html');
    assert.ok(trackCalls.some((c) => c.event === 'plan_reveal_cta_view_groceries'));
  });

  test('dismiss (backdrop/close) removes the overlay without touching stored plan data', () => {
    const { sandbox, appended, removedCountRef, bodyClassList } = makeSandbox();
    sandbox.window.PlanReveal.show(validData(), 'dashboard');
    assert.ok(bodyClassList.has('plan-reveal-open'));
    appended[0]._fireClick({ closest: (sel) => (sel === '[data-action]' ? { getAttribute: () => 'dismiss' } : null) });
    assert.equal(removedCountRef(), 1);
    assert.ok(!bodyClassList.has('plan-reveal-open'));
  });

  test('show() never touches localStorage — it cannot lose or overwrite the plan the caller already saved', () => {
    const { sandbox } = makeSandbox();
    let touched = false;
    sandbox.localStorage = new Proxy({}, { get() { touched = true; return () => {}; } });
    sandbox.window.PlanReveal.show(validData(), 'dashboard');
    assert.equal(touched, false);
  });
});

describe('analytics payload never carries sensitive/plan data', () => {
  test('plan_reveal_viewed payload is just {source}', () => {
    const { sandbox, trackCalls } = makeSandbox();
    sandbox.window.PlanReveal.show(validData(), 'dashboard');
    const viewed = trackCalls.find((c) => c.event === 'plan_reveal_viewed');
    assert.deepEqual(Object.keys(viewed.data), ['source']);
    assert.equal(viewed.data.source, 'dashboard');
  });

  test('no call ever includes calories, protein, cost, meal names, planId, or weekStart', () => {
    const { sandbox, appended, trackCalls } = makeSandbox();
    sandbox.window.PlanReveal.show(validData(), 'dashboard');
    appended[0]._fireClick({ closest: (sel) => (sel === '[data-action]' ? { getAttribute: () => 'view-groceries' } : null) });
    const forbidden = ['calories', 'protein', 'cost', 'totalCost', 'planId', 'weekStart', 'meals', 'name'];
    for (const call of trackCalls) {
      for (const key of forbidden) assert.equal(Object.prototype.hasOwnProperty.call(call.data, key), false);
    }
  });
});
