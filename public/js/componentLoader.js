// Fetches every <div data-component="name"></div> placeholder's partial from
// /partials/<name>.html and injects it. Runs in passes so a partial that
// itself contains a nested data-component div (e.g. today-schedule.html
// nesting hero-empty.html) gets picked up too. Fires 'components:ready' on
// document once nothing is left to load — dashboard-panels.js waits for that
// event before touching any of this DOM.
(function () {
  const SKELETON_URL = '/partials/components/skeleton-card.html';
  let skeletonHtml = null;

  async function getSkeletonHtml() {
    if (skeletonHtml === null) {
      try {
        const res = await fetch(SKELETON_URL);
        skeletonHtml = res.ok ? await res.text() : '';
      } catch (e) {
        skeletonHtml = '';
      }
    }
    return skeletonHtml;
  }

  async function loadComponent(el) {
    const name = el.getAttribute('data-component');
    el.setAttribute('data-loaded', '1'); // mark first so a later pass doesn't refetch it
    if (el.getAttribute('data-skeleton') !== 'off') {
      el.innerHTML = await getSkeletonHtml();
    }
    try {
      const res = await fetch(`/partials/${name}.html`);
      if (!res.ok) throw new Error(`componentLoader: ${name} → ${res.status}`);
      el.innerHTML = await res.text();
    } catch (err) {
      console.error(err.message);
      el.innerHTML = '';
    }
  }

  async function loadPendingPass() {
    const nodes = Array.from(document.querySelectorAll('[data-component]:not([data-loaded])'));
    if (!nodes.length) return false;
    await Promise.all(nodes.map(loadComponent));
    return true;
  }

  async function loadAll() {
    // eslint-disable-next-line no-await-in-loop
    while (await loadPendingPass()) { /* keep going while nested placeholders appear */ }
    document.dispatchEvent(new CustomEvent('components:ready'));
  }

  document.addEventListener('DOMContentLoaded', loadAll);
})();
