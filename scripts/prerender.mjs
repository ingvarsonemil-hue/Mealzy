// Runs after `vite build`. Loads each page's React component through Vite's SSR
// pipeline and inlines its rendered markup into the already-built dist/<page>.html,
// so <div id="root"> isn't empty for crawlers/no-JS clients before hydration runs.
// Head tags (<title>, meta, canonical, OG, JSON-LD) are untouched — they're already
// static and correct per file in each source HTML.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { prerenderRoutes } from '../src/prerender/routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

if (!existsSync(path.join(distDir, 'index.html'))) {
  console.error('[prerender] dist/index.html not found — run `vite build` before prerender.mjs.');
  process.exit(1);
}

// These components run in Node with no browser environment. client/src/lib/stripe.js
// reads window.STRIPE_* getters synchronously during render (not in useEffect) and
// falls back safely to a real, valid checkout URL (FALLBACK_MONTHLY) when a getter is
// undefined — confirmed safe, not a placeholder. LoginPage reads window.location.search
// synchronously via useMemo during render; an empty search string reproduces the correct
// default signed-out view (no ?signup=1, no ?error=, no ?ref=), which is also a safe,
// non-misleading fallback rather than a fake value. LegalLayout's scroll-spy hook reads
// window.location.hash synchronously during render (useState initializer); a real
// Location object always has a `hash` string (empty when there's no fragment), so an
// empty string here is a faithful stand-in for a plain page load, not a shim.
global.window = {
  STRIPE_ANNUAL_READY: false,
  location: { search: '', hash: '' },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  }
};
global.localStorage = global.window.localStorage;

async function main() {
  const vite = await createServer({
    configFile: path.resolve(rootDir, 'vite.config.mjs'),
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    mode: 'production'
  });

  let succeeded = 0;
  let skipped = 0;

  for (const route of prerenderRoutes) {
    try {
      const mod = await vite.ssrLoadModule(route.importPath);
      const Component = mod.default;
      if (typeof Component !== 'function') {
        throw new Error(`no default export function found at ${route.importPath}`);
      }

      const markup = renderToString(React.createElement(Component));

      const outFile = path.join(distDir, route.outPath);
      const html = await fs.readFile(outFile, 'utf8');
      const rootOpenTag = '<div id="root">';
      const rootCloseTag = '</div>';
      const startIdx = html.indexOf(rootOpenTag);
      if (startIdx === -1) {
        throw new Error(`<div id="root"> not found in dist/${route.outPath}`);
      }
      const contentStart = startIdx + rootOpenTag.length;
      const endIdx = html.indexOf(rootCloseTag, contentStart);
      if (endIdx === -1) {
        throw new Error(`closing </div> for #root not found in dist/${route.outPath}`);
      }

      const updated = html.slice(0, contentStart) + markup + html.slice(endIdx);
      await fs.writeFile(outFile, updated, 'utf8');
      succeeded += 1;
      console.log(`[prerender] ${route.key} -> dist/${route.outPath}`);
    } catch (err) {
      skipped += 1;
      console.warn(`[prerender] SKIPPED ${route.key}: ${err.message}`);
    }
  }

  await vite.close();
  console.log(`[prerender] done: ${succeeded} rendered, ${skipped} skipped.`);
}

main().then(() => process.exit(0));
