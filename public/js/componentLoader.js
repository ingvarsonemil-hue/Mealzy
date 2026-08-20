const REGISTRY = {
  'layout/sidebar':                 '/partials/layout/sidebar.html',
  'layout/topbar':                  '/partials/layout/topbar.html',
  'layout/fab':                     '/partials/layout/fab.html',
  'components/retention-banners':   '/partials/components/retention-banners.html',
  'components/recipes-panel':       '/partials/components/recipes-panel.html',
  'components/pwa-banner':          '/partials/components/pwa-banner.html',
  'components/recipe-modal':        '/partials/components/recipe-modal.html',
  'components/loading-overlay':     '/partials/components/loading-overlay.html',
  'components/nps-modal':           '/partials/components/nps-modal.html',
  'components/import-recipe-modal': '/partials/components/import-recipe-modal.html',
  'dashboard/today-schedule':       '/partials/dashboard/today-schedule.html',
  'dashboard/budget-macro-grid':    '/partials/dashboard/budget-macro-grid.html',
  'dashboard/recent-plans':         '/partials/dashboard/recent-plans.html',
  'dashboard/hero-empty':           '/partials/dashboard/hero-empty.html',
  'planner/nav':                    '/partials/planner/nav.html',
  'planner/header':                 '/partials/planner/header.html',
  'planner/banners':                '/partials/planner/banners.html',
  'planner/day-container':          '/partials/planner/day-container.html',
  'planner/share-panel':            '/partials/planner/share-panel.html',
  'planner/week-view':              '/partials/planner/week-view.html',
  'planner/stats-bar':              '/partials/planner/stats-bar.html',
  'planner/modals':                 '/partials/planner/modals.html',
};

async function fetchPartial(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Partial ${path} → ${res.status}`);
  return res.text();
}

async function mount(node) {
  const name = node.getAttribute('data-component');
  const path = REGISTRY[name];
  if (!path) { console.warn(`[loader] unknown component: ${name}`); return; }
  try {
    node.innerHTML = await fetchPartial(path);
    node.setAttribute('data-component-loaded', 'true');
  } catch (err) {
    console.error(`[loader] ${name}`, err);
  }
}

async function loadAll(root = document) {
  const nodes = Array.from(root.querySelectorAll('[data-component]'));
  await Promise.all(nodes.map(mount));
  document.dispatchEvent(new CustomEvent('components:ready', {
    bubbles: true,
    detail: { count: nodes.length },
  }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => loadAll());
} else {
  loadAll();
}