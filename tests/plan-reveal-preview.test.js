'use strict';

// Proves the internal marketing-screenshot page (public/plan-reveal-preview.html)
// renders the REAL PlanReveal component from a static fixture with zero side
// effects: no analytics, no network/AI, no user-data reads, and CTAs that can
// never navigate into a plan that doesn't exist. Also guards that the tiny
// `opts` arg added to show() leaves default production behavior untouched.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const JS_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plan-reveal.js'), 'utf8');
const PAGE_HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'plan-reveal-preview.html'), 'utf8');

// The exact fixture the page builds (server.js week-mode response shape).
function previewFixture() {
  const MEAL_NAMES = [
    ['Greek Yogurt & Berry Bowl', 'Chicken Burrito Bowl', 'Salmon Traybake with Greens', 'Apple & Almond Butter'],
    ['Spinach Feta Scramble', 'Turkey Pesto Wrap', 'Beef & Broccoli Stir-Fry', 'Cottage Cheese & Peach'],
    ['Overnight Oats with Banana', 'Tuna Nicoise Salad', 'Chickpea Coconut Curry', 'Dark Chocolate & Walnuts'],
    ['Peanut Butter Protein Smoothie', 'Grilled Halloumi Salad', 'Baked Cod with Potatoes', 'Hummus & Carrot Sticks'],
    ['Egg & Avocado Toast', 'Chicken Caesar Bowl', 'Pork Tenderloin with Squash', 'Greek Yogurt & Honey'],
    ['Blueberry Protein Pancakes', 'Lentil & Feta Salad', 'Shrimp Fried Rice', 'Cheese & Grapes'],
    ['Muesli with Milk', 'Falafel Pita Plate', 'Roast Chicken with Veg', 'Banana & Peanut Butter'],
  ];
  const TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
  return {
    success: true,
    planId: 'preview',
    weekStart: '2026-08-24',
    days: MEAL_NAMES.map((names, d) => ({
      date: '2026-08-' + (24 + d),
      meals: names.map((name, i) => ({ name, type: TYPES[i] })),
    })),
    weeklyTotals: { avgCalories: 2148, avgProtein: 165, totalCost: 68, budgetStatus: 'estimated_with_unknowns' },
  };
}

function makeSandbox() {
  const trackCalls = [];
  const appended = [];
  const forbiddenAccess = [];

  function makeEl() {
    const listeners = {};
    return {
      className: '', innerHTML: '', attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return this.attrs[k]; },
      addEventListener(type, fn) { listeners[type] = fn; },
      _fireClick(target) { if (listeners.click) listeners.click({ target }); },
      remove() {},
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
    addEventListener() {},
    removeEventListener() {},
    get cookie() { forbiddenAccess.push('document.cookie'); return ''; },
  };

  const trap = (label) => new Proxy(function () {}, {
    get() { forbiddenAccess.push(label); return () => {}; },
    apply() { forbiddenAccess.push(label); return undefined; },
  });

  const sandbox = {
    document: documentStub,
    location: { pathname: '/plan-reveal-preview.html', href: '', search: '' },
    mealzyTrack: (event, data) => trackCalls.push({ event, data }),
    fetch: trap('fetch'),
    XMLHttpRequest: trap('XMLHttpRequest'),
    localStorage: new Proxy({}, { get() { forbiddenAccess.push('localStorage'); return () => {}; } }),
    sessionStorage: new Proxy({}, { get() { forbiddenAccess.push('sessionStorage'); return () => {}; } }),
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(JS_SOURCE, sandbox, { filename: 'plan-reveal.js' });
  return { sandbox, trackCalls, appended, forbiddenAccess, bodyClassList };
}

const clickAction = (kind) => ({ closest: (sel) => (sel === '[data-action]' ? { getAttribute: () => kind } : null) });

describe('plan-reveal-preview.html — static page', () => {
  test('loads the real component script, not a reimplementation', () => {
    assert.match(PAGE_HTML, /<script src="\/js\/plan-reveal\.js">/);
    assert.match(PAGE_HTML, /PlanReveal\.show\(FIXTURE, 'preview', \{ analytics: false, disableNavigation: true \}\)/);
  });

  test('pulls in no analytics / consent / network scripts', () => {
    const code = PAGE_HTML.replace(/<!--[\s\S]*?-->/g, ''); // ignore explanatory comments
    assert.doesNotMatch(code, /consent\.js|gtag|plausible|posthog|mealzyTrack/i);
    assert.doesNotMatch(code, /fetch\(|XMLHttpRequest|anthropic|\/api\//i);
  });

  test('is marked noindex and carries a visible preview marker', () => {
    assert.match(PAGE_HTML, /name="robots" content="noindex/);
    assert.match(PAGE_HTML, /class="preview-marker"[^>]*>Preview/);
  });

  test('theme-init.js is the first script in <head>', () => {
    const head = PAGE_HTML.slice(0, PAGE_HTML.indexOf('</head>'));
    assert.match(head.slice(0, head.indexOf('</script>')), /\/js\/theme-init\.js/);
  });
});

describe('preview render — real PlanReveal, real numbers, zero side effects', () => {
  test('renders the real reveal with the demo macros', () => {
    const { sandbox, appended } = makeSandbox();
    const ok = sandbox.window.PlanReveal.show(previewFixture(), 'preview', { analytics: false, disableNavigation: true });
    assert.equal(ok, true);
    assert.equal(appended.length, 1);
    const html = appended[0].innerHTML;
    assert.match(html, /Your week is ready\./);
    assert.match(html, /2[\s,]148/); // en-locale renders "2,148" in the browser
    assert.match(html, /165g/);
    assert.match(html, /~\$68/);
    assert.match(html, /7 days &middot; 28 meals &middot; 1 grocery list/);
    assert.match(html, /prices estimated/i); // estimated_with_unknowns caveat retained
  });

  test('no analytics fire in preview mode — not even one call', () => {
    const { sandbox, appended, trackCalls } = makeSandbox();
    sandbox.window.PlanReveal.show(previewFixture(), 'preview', { analytics: false, disableNavigation: true });
    appended[0]._fireClick(clickAction('view-plan'));
    appended[0]._fireClick(clickAction('dismiss'));
    assert.equal(trackCalls.length, 0);
  });

  test('no network / AI request primitives are ever touched', () => {
    const { sandbox, appended, forbiddenAccess } = makeSandbox();
    sandbox.window.PlanReveal.show(previewFixture(), 'preview', { analytics: false, disableNavigation: true });
    appended[0]._fireClick(clickAction('view-groceries'));
    assert.deepEqual(forbiddenAccess.filter((x) => x === 'fetch' || x === 'XMLHttpRequest'), []);
  });

  test('no user-data stores are read (localStorage / sessionStorage / cookie)', () => {
    const { sandbox, appended, forbiddenAccess } = makeSandbox();
    sandbox.window.PlanReveal.show(previewFixture(), 'preview', { analytics: false, disableNavigation: true });
    appended[0]._fireClick(clickAction('dismiss'));
    assert.deepEqual(forbiddenAccess, []);
  });

  test('CTAs cannot navigate into a fake plan — they only dismiss', () => {
    const { sandbox, appended } = makeSandbox();
    sandbox.window.PlanReveal.show(previewFixture(), 'preview', { analytics: false, disableNavigation: true });
    appended[0]._fireClick(clickAction('view-plan'));
    assert.equal(sandbox.location.href, '');

    const s2 = makeSandbox();
    s2.sandbox.window.PlanReveal.show(previewFixture(), 'preview', { analytics: false, disableNavigation: true });
    s2.appended[0]._fireClick(clickAction('view-groceries'));
    assert.equal(s2.sandbox.location.href, '');
  });
});

describe('production behavior is unchanged when show() gets no opts', () => {
  function validData() {
    return {
      success: true, weekStart: '2026-08-24', planId: 'plan-real-1',
      days: [{ date: '2026-08-24', meals: [{ name: 'Oatmeal', type: 'breakfast' }, { name: 'Wrap', type: 'lunch' }] }],
      weeklyTotals: { avgCalories: 2000, avgProtein: 150, totalCost: 60, budgetStatus: 'certified' },
    };
  }

  test('default CTA still navigates to the meal planner', () => {
    const { sandbox, appended } = makeSandbox();
    sandbox.window.PlanReveal.show(validData(), 'dashboard');
    appended[0]._fireClick(clickAction('view-plan'));
    assert.equal(sandbox.location.href, 'meal-planner.html');
  });

  test('default analytics still fire', () => {
    const { sandbox, trackCalls } = makeSandbox();
    sandbox.window.PlanReveal.show(validData(), 'dashboard');
    assert.ok(trackCalls.some((c) => c.event === 'plan_reveal_viewed'));
  });
});
