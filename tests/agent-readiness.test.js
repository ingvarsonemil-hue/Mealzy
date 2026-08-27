'use strict';

// Regression tests for the agent-readiness ("Is Agentic") fixes:
//   1. Real HTTP 404s for unknown paths (no soft-200 app shell).
//   2. Markdown content negotiation + `Vary: Accept` (acceptmarkdown.com).
//   3. llms.txt "when to use" agent guidance.
//   4. Trust anchor pages reachable at /about, /contact, /privacy.
//   5. Organization JSON-LD completeness (contactPoint + address).
//
// This repo has no supertest/HTTP harness and server.js has boot side effects
// (Turso, listen), so — matching tests/pricing-checkout.test.js and
// tests/live-login-page.test.js — the pure negotiation helper is extracted and
// run for real via `vm`, and the wiring is proven with literal-source and
// parsed-artifact assertions.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SERVER_SRC = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

function extractFn(src, name) {
  const norm = src.replace(/\r\n/g, '\n');
  const startIdx = norm.indexOf(`function ${name}(`);
  assert.notEqual(startIdx, -1, `expected to find function ${name} in server.js`);
  const endIdx = norm.indexOf('\n}\n', startIdx);
  assert.notEqual(endIdx, -1, `expected to find the closing brace for ${name}`);
  return norm.slice(startIdx, endIdx + 2);
}

function loadPrefersMarkdown() {
  const ctx = { result: undefined };
  vm.createContext(ctx);
  vm.runInContext(`${extractFn(SERVER_SRC, 'prefersMarkdown')}\nresult = prefersMarkdown;`, ctx, { filename: 'server.js-prefersMarkdown' });
  return ctx.result;
}

describe('prefersMarkdown — Accept negotiation', () => {
  const prefersMarkdown = loadPrefersMarkdown();

  test('explicit text/markdown wins', () => {
    assert.equal(prefersMarkdown('text/markdown'), true);
    assert.equal(prefersMarkdown('text/markdown, text/html;q=0.9'), true);
    assert.equal(prefersMarkdown('text/x-markdown'), true);
  });

  test('HTML-preferring or absent Accept does not negotiate markdown', () => {
    assert.equal(prefersMarkdown('text/html,application/xhtml+xml,*/*'), false);
    assert.equal(prefersMarkdown('text/html;q=0.9, text/markdown;q=0.8'), false);
    assert.equal(prefersMarkdown('*/*'), false);
    assert.equal(prefersMarkdown(''), false);
    assert.equal(prefersMarkdown(undefined), false);
  });
});

describe('server.js — real 404s, no soft-200 shell', () => {
  test('the old catch-all that served index.html with a 200 is gone', () => {
    assert.doesNotMatch(
      SERVER_SRC,
      /app\.get\(\s*['"]\*['"]\s*,\s*async\s*\(req,\s*res\)\s*=>\s*\{[\s\S]*?sendFile\([^)]*index\.html/,
      'catch-all must not serve index.html on unknown paths'
    );
  });

  test('a status-404 fallthrough handler exists', () => {
    assert.match(SERVER_SRC, /res\.status\(404\)/);
    assert.match(SERVER_SRC, /public['"],\s*['"]404\.html['"]/);
    assert.match(SERVER_SRC, /NOT_FOUND_MD/);
  });

  test('unknown /api paths get a JSON 404', () => {
    assert.match(SERVER_SRC, /req\.path\.startsWith\(['"]\/api\/['"]\)[\s\S]*?not_found/);
  });

  test('public/404.html exists and is noindex', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public', '404.html'), 'utf8');
    assert.match(html, /name=["']robots["']\s+content=["']noindex["']/);
    assert.match(html, /sitemap\.xml/);
    assert.match(html, /^<script src="\/js\/theme-init\.js">/m);
  });
});

describe('markdown content negotiation (acceptmarkdown.com)', () => {
  test('negotiated pages set Vary: Accept and can serve text/markdown', () => {
    assert.match(SERVER_SRC, /res\.vary\(['"]Accept['"]\)/);
    assert.match(SERVER_SRC, /text\/markdown; charset=utf-8/);
    assert.match(SERVER_SRC, /MARKDOWN_PAGES\s*=\s*\{[\s\S]*?'\/':\s*'index\.md'/);
  });

  test('a markdown file exists for every negotiated page', () => {
    const map = { '/': 'index.md', '/about': 'about.md', '/contact': 'contact.md', '/privacy': 'privacy.md' };
    for (const file of Object.values(map)) {
      const p = path.join(ROOT, 'public', 'llm', file);
      assert.ok(fs.existsSync(p), `${file} must exist`);
      assert.ok(fs.readFileSync(p, 'utf8').length > 400, `${file} must have real content`);
    }
  });
});

describe('trust anchor pages', () => {
  test('/about, /contact, /privacy are wired to real HTML pages', () => {
    assert.match(SERVER_SRC, /CLEAN_URL_PAGES\s*=\s*\{[\s\S]*?'\/about'[\s\S]*?'\/contact'[\s\S]*?'\/privacy'/);
    for (const f of ['about.html', 'support.html', 'privacy-policy.html']) {
      const src = fs.readFileSync(path.join(ROOT, 'public', f), 'utf8');
      const text = src.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      assert.ok(text.length > 500, `${f} must have >500 chars of content`);
    }
  });
});

describe('llms.txt — agent when-to-use guidance', () => {
  const llms = fs.readFileSync(path.join(ROOT, 'public', 'llms.txt'), 'utf8');

  test('has a "when to use" section with concrete jobs', () => {
    assert.match(llms, /##\s*When To Use/i);
    assert.match(llms, /not the right tool for/i);
  });

  test('tells an agent how to call Mealzy', () => {
    assert.match(llms, /##\s*How An Agent Should Use/i);
    assert.match(llms, /no public (JSON )?API/i);
  });
});

describe('Organization JSON-LD completeness', () => {
  const html = fs.readFileSync(path.join(ROOT, 'client', 'index.html'), 'utf8');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(m => JSON.parse(m[1]));
  const org = blocks.find(b => b['@type'] === 'Organization');

  test('an Organization block is present and valid JSON', () => {
    assert.ok(org, 'Organization JSON-LD must exist');
  });

  test('has contactPoint with email and contactType', () => {
    assert.equal(org.contactPoint['@type'], 'ContactPoint');
    assert.ok(org.contactPoint.email);
    assert.ok(org.contactPoint.contactType);
  });

  test('has a PostalAddress', () => {
    assert.equal(org.address['@type'], 'PostalAddress');
    assert.ok(org.address.addressLocality);
    assert.ok(org.address.addressCountry);
  });
});
