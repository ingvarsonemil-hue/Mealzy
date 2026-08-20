const REGISTRY = {
  'dashboard/shell':         '/partials/dashboard/shell.html',
  'dashboard/budget-card':   '/partials/dashboard/budget-card.html',
  'dashboard/macro-card':    '/partials/dashboard/macro-card.html',
  'dashboard/meals-card':    '/partials/dashboard/meals-card.html',
  'dashboard/activity-card': '/partials/dashboard/activity-card.html',
  'dashboard/quick-actions': '/partials/dashboard/quick-actions.html',
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

export { loadAll };