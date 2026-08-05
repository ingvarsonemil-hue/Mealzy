import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Sun, Moon, Menu, X } from '@/components/icons';
import { cn, scrollToHash, prefersReducedMotion } from '@/lib/utils';

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '/pricing.html', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' }
];

export function useTheme() {
  const [theme, setTheme] = React.useState(() =>
    typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-theme') || 'light'
      : 'light'
  );
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('mealzy_theme', next); } catch (e) { /* private mode */ }
    setTheme(next);
  };
  return [theme, toggle];
}

export default function Header({ links = NAV_LINKS, activeHref }) {
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [theme, toggleTheme] = useTheme();

  React.useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => window.removeEventListener('scroll', update);
  }, []);

  /* Anchor taps inside the open dialog must wait for it to close: the Radix
   * scroll lock and focus-return would cancel an in-flight smooth scroll.
   * We stash the target and scroll from onCloseAutoFocus instead. */
  const pendingHash = React.useRef(null);
  const onAnchorClick = (e, href) => {
    if (!href.startsWith('#')) return;
    if (mobileOpen) {
      e.preventDefault();
      pendingHash.current = href;
      setMobileOpen(false);
    } else {
      scrollToHash(e, href);
    }
  };
  const onMobileNavClosed = (e) => {
    const href = pendingHash.current;
    if (!href) return;
    pendingHash.current = null;
    e.preventDefault();
    // One macrotask later: the Radix/react-remove-scroll body lock is torn down
    // on unmount, and scrolling while it is active silently no-ops.
    setTimeout(() => {
      document.querySelector(href)?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start'
      });
    }, 100);
  };

  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        'fixed inset-x-0 top-0 z-50 text-on-forest transition-[background-color,box-shadow] duration-300',
        scrolled ? 'bg-forest/95 shadow-md backdrop-blur-sm' : 'bg-transparent'
      )}
    >
      <div className="mx-auto flex h-16 max-w-container items-center justify-between px-4 sm:px-5">
        <a href="/" aria-label="Mealzy home" className="font-display text-2xl font-black italic text-on-forest no-underline">
          Mealzy
        </a>

        <ul className="hidden items-center gap-8 md:flex" role="list">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                onClick={(e) => onAnchorClick(e, l.href)}
                aria-current={l.href === activeHref ? 'page' : undefined}
                className={cn(
                  'text-[15px] font-medium no-underline transition-colors duration-200 hover:text-on-forest',
                  l.href === activeHref ? 'text-on-forest' : 'text-on-forest-body'
                )}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-on-forest-body transition-colors duration-200 hover:bg-forest-raise hover:text-on-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </button>
          <Button href="/login.html" variant="quiet" size="sm" className="hidden text-on-forest-body hover:text-on-forest md:inline-flex">
            Sign in
          </Button>
          {/* Short variant: the full "Build My Free Plan" wraps to two lines in the
            * nav bar at the md breakpoint, where space is tightest. */}
          <Button href="/login.html?signup=1" size="sm" className="hidden md:inline-flex">
            Build My Plan
          </Button>

          {/* Mobile slide-out panel */}
          <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <Dialog.Trigger asChild>
              <button
                aria-label="Open menu"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-on-forest transition-colors duration-200 hover:bg-forest-raise md:hidden"
              >
                <Menu />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-fade-in motion-reduce:animate-none" />
              <Dialog.Content
                aria-label="Navigation menu"
                aria-describedby={undefined}
                onCloseAutoFocus={onMobileNavClosed}
                className="fixed inset-y-0 right-0 z-50 flex w-[300px] max-w-[85vw] flex-col bg-forest p-6 text-on-forest shadow-xl outline-none transition-transform data-[state=open]:animate-slide-in motion-reduce:animate-none"
              >
                <Dialog.Title className="sr-only">Navigation menu</Dialog.Title>
                <div className="flex items-center justify-between">
                  <span className="font-display text-xl font-black italic">Mealzy</span>
                  <Dialog.Close asChild>
                    <button
                      aria-label="Close menu"
                      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-on-forest-body hover:bg-forest-raise hover:text-on-forest"
                    >
                      <X />
                    </button>
                  </Dialog.Close>
                </div>
                <ul className="mt-8 flex flex-col gap-1" role="list">
                  {links.map((l) => (
                    <li key={l.href}>
                      <a
                        href={l.href}
                        onClick={(e) => onAnchorClick(e, l.href)}
                        className="block rounded-md px-3 py-3 text-lg font-medium text-on-forest-strong no-underline hover:bg-forest-raise"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                  <li>
                    <a href="/login.html" className="block rounded-md px-3 py-3 text-lg font-medium text-on-forest-strong no-underline hover:bg-forest-raise">
                      Sign in
                    </a>
                  </li>
                  <li className="mt-4">
                    <Button href="/login.html?signup=1" full>Build My Free Plan</Button>
                  </li>
                </ul>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </nav>
  );
}
