import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { signOut as apiSignOut } from '@/lib/auth';
import {
  Menu, X, NavDashboard, NavPlanner, NavGroceries, NavAnalytics, NavCoach, NavRecipes, NavSettings, LogOut
} from '@/components/icons';

const NAV_ITEMS = [
  { id: 'dashboard', href: '/dashboard.html', label: 'Dashboard', Icon: NavDashboard },
  { id: 'planner', href: '/meal-planner.html', label: 'Meal Planner', Icon: NavPlanner },
  { id: 'groceries', href: '/grocery-list.html', label: 'Groceries', Icon: NavGroceries },
  { id: 'analytics', href: '/analytics.html', label: 'Analytics', Icon: NavAnalytics },
  { id: 'coach', href: '/ai-coach.html', label: 'AI Coach', Icon: NavCoach },
  { id: 'settings', href: '/settings.html', label: 'Settings', Icon: NavSettings }
];

/* Shared app-shell (sidebar + mobile topbar/menu) for the authenticated app
 * pages (dashboard, meal-planner, grocery-list). Consolidates what was three
 * independently-duplicated DOM copies in the legacy pages into one
 * responsive component — same nav items, same links, same behavior.
 *
 * The "Recipes" nav item is legacy-inert on desktop (the old sidebar hid it
 * with display:none and never un-hid it) and only ever shown in the mobile
 * slide-out menu, where it links to dashboard.html#recipes. On the dashboard
 * page itself, pass `onRecipesClick` to make it open the in-page panel
 * instead of navigating. That mismatch is preserved intentionally, not a bug
 * introduced here — see PR notes. */
export default function AppShell({ active, user, onRecipesClick, children }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const handleSignOut = async () => {
    await apiSignOut();
    try { localStorage.clear(); } catch (e) { /* private mode */ }
    window.location.href = '/login.html';
  };

  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase() || '?';
  const planLabel = user?.pro ? 'Pro' : 'Free Plan';

  const NavLinks = ({ mobile }) => (
    <nav className="flex flex-col gap-1 px-3.5 py-4" aria-label="App navigation">
      {NAV_ITEMS.map(({ id, href, label, Icon }) => (
        <a
          key={id}
          href={href}
          aria-current={id === active ? 'page' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-md px-3.5 py-[0.7rem] text-[0.9rem] font-medium no-underline transition-colors duration-150',
            id === active ? 'bg-forest-raise text-on-forest' : 'text-on-forest-body hover:bg-forest-raise hover:text-on-forest'
          )}
        >
          <Icon />
          {label}
        </a>
      ))}
      <a
        href="/dashboard.html#recipes"
        onClick={onRecipesClick}
        className={cn(
          'items-center gap-3 rounded-md px-3.5 py-[0.7rem] text-[0.9rem] font-medium text-on-forest-body no-underline transition-colors duration-150 hover:bg-forest-raise hover:text-on-forest',
          mobile ? 'flex' : 'hidden'
        )}
      >
        <NavRecipes />
        Recipes
      </a>
    </nav>
  );

  const SidebarFooter = ({ showSupport }) => (
    <div className="border-t border-forest-line px-6 py-[1.1rem]">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-raise font-display text-sm font-bold text-on-forest">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[0.88rem] font-bold text-on-forest-strong">{user?.name || user?.email || 'Your account'}</div>
          <div className="text-sm text-on-forest-muted">{planLabel}</div>
        </div>
      </div>
      <button
        onClick={handleSignOut}
        className="mt-2 flex w-full cursor-pointer items-center gap-2 border-none bg-transparent py-1.5 text-left font-body text-[0.82rem] text-on-forest-muted hover:text-on-forest-strong"
      >
        <LogOut />
        Sign Out
      </button>
      {showSupport && (
        <a href="mailto:support@mealzy.org" className="mt-2 block text-xs text-on-forest-muted no-underline hover:text-on-forest-body">
          support@mealzy.org
        </a>
      )}
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Mobile topbar */}
      <div className="flex h-14 items-center justify-between border-b border-clr-border bg-clr-canvas px-4 md:hidden">
        <a href="/dashboard.html" className="flex items-center gap-2 font-display text-base font-black italic text-foreground no-underline">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-green text-sm font-black text-white">M</span>
          Mealzy
        </a>
        <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <Dialog.Trigger asChild>
            <button
              aria-label="Open menu"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-foreground hover:bg-muted-bg"
            >
              <Menu />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-fade-in motion-reduce:animate-none" />
            <Dialog.Content
              aria-label="Navigation menu"
              aria-describedby={undefined}
              className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-forest text-on-forest shadow-xl outline-none data-[state=open]:animate-slide-in motion-reduce:animate-none"
            >
              <Dialog.Title className="sr-only">Navigation menu</Dialog.Title>
              <div className="flex items-center justify-between px-6 py-5">
                <span className="font-display text-xl font-black italic">Mealzy</span>
                <Dialog.Close asChild>
                  <button aria-label="Close menu" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-on-forest-body hover:bg-forest-raise hover:text-on-forest">
                    <X />
                  </button>
                </Dialog.Close>
              </div>
              <div className="flex-1 overflow-y-auto">
                <NavLinks mobile />
              </div>
              <SidebarFooter showSupport={false} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden w-[260px] shrink-0 flex-col bg-forest text-on-forest md:flex">
        <a href="/dashboard.html" className="px-6 py-6 font-display text-2xl font-black italic text-on-forest no-underline">
          Mealzy
        </a>
        <div className="flex-1 overflow-y-auto">
          <NavLinks mobile={false} />
        </div>
        <SidebarFooter showSupport />
      </div>

      {/* Main content */}
      <main className="min-h-screen flex-1 bg-clr-canvas px-4 py-6 sm:px-6 md:px-8 md:py-8">
        {children}
      </main>
    </div>
  );
}
