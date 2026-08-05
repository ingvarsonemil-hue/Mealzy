import * as React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: 'index.html#how-it-works', label: 'How it works' },
  { href: 'pricing.html', label: 'Pricing' },
  { href: 'index.html#faq', label: 'FAQ' }
];

/* Highlights the TOC entry for the section currently under the fixed header.
 * The rootMargin band means "intersecting" ≈ "its heading sits in the top
 * quarter of the viewport", which tracks reading position closely enough. */
function useActiveSection(ids) {
  const [active, setActive] = React.useState(() => {
    const hash = window.location.hash.slice(1);
    return ids.includes(hash) ? hash : ids[0];
  });
  React.useEffect(() => {
    const visible = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        });
        const first = ids.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: '-96px 0px -70% 0px' }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function TocList({ toc, active, onNavigate }) {
  return (
    <ul role="list" className="flex flex-col gap-1.5">
      {toc.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            onClick={onNavigate}
            aria-current={active === item.id ? 'location' : undefined}
            className={cn(
              /* py-2.5 keeps mobile touch targets ≥44px; desktop can be denser */
              'block rounded-sm px-2 py-2.5 text-[14px] leading-snug no-underline transition-colors duration-200 lg:py-1',
              active === item.id
                ? 'legal-toc-active font-semibold'
                : 'text-muted-fg hover:text-foreground'
            )}
          >
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function LegalLayout({ title, updated, toc, children }) {
  const ids = React.useMemo(() => toc.map((t) => t.id), [toc]);
  const active = useActiveSection(ids);

  /* Deep-links (privacy-policy.html#stripe): the browser's own fragment
   * scroll can fire before React has rendered the sections, so re-apply
   * it once on mount. Instant, not smooth — this is a page load. */
  React.useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id || !ids.includes(id)) return;
    /* 'instant', not 'auto': auto defers to the html scroll-behavior,
     * which is smooth and gets throttled in background tabs. */
    const jump = () =>
      document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' });
    jump();
    /* Fraunces/Inter arrive after mount and reflow the page, moving the
     * target. Re-anchor on any layout-size change during the first few
     * seconds, unless the user has started scrolling on their own. */
    const observer = new ResizeObserver(jump);
    observer.observe(document.body);
    const stop = () => observer.disconnect();
    /* Any user-initiated scroll (wheel, touch, PageDown/arrows, scrollbar
     * drag) hands control back — never yank them to the anchor mid-read. */
    const cancelEvents = ['wheel', 'touchmove', 'keydown', 'mousedown'];
    cancelEvents.forEach((ev) => window.addEventListener(ev, stop, { passive: true, once: true }));
    const timer = setTimeout(stop, 3000);
    return () => {
      stop();
      clearTimeout(timer);
      cancelEvents.forEach((ev) => window.removeEventListener(ev, stop));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const detailsRef = React.useRef(null);
  const closeMobileToc = () => detailsRef.current?.removeAttribute('open');

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header links={NAV_LINKS} />
      <main id="main">
        <header className="bg-forest pb-12 pt-28 text-on-forest sm:pb-14 sm:pt-32">
          <div className="mx-auto max-w-container px-4 sm:px-5">
            <h1 className="font-display text-[clamp(2.25rem,3vw+1rem,3.25rem)] font-black italic leading-[1.05] tracking-[-0.03em]">
              {title}
            </h1>
            <p className="mt-3 text-[15px] text-on-forest-body">{updated}</p>
          </div>
        </header>

        <div className="mx-auto max-w-container px-4 py-12 sm:px-5 sm:py-16 lg:grid lg:grid-cols-[220px_minmax(0,680px)] lg:justify-center lg:gap-x-16">
          {/* Mobile: collapsible jump list, no JS required to open/close */}
          <nav aria-label="On this page" className="mb-8 lg:hidden">
            <details
              ref={detailsRef}
              className="rounded-md border border-border-warm bg-cream"
            >
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-muted-fg [&::-webkit-details-marker]:hidden">
                On this page
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform duration-200 motion-reduce:transition-none [details[open]_&]:rotate-180"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <div className="border-t border-hairline px-2 py-2">
                <TocList toc={toc} active={active} onNavigate={closeMobileToc} />
              </div>
            </details>
          </nav>

          {/* Desktop: sticky sidebar with scroll-spy */}
          <nav
            aria-label="On this page"
            className="hidden self-start lg:sticky lg:top-24 lg:block"
          >
            <h2 className="mb-3 px-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">
              On this page
            </h2>
            <TocList toc={toc} active={active} />
          </nav>

          <article className="legal-prose">{children}</article>
        </div>
      </main>
      <Footer />
    </>
  );
}
