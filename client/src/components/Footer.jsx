import * as React from 'react';
import { scrollToHash } from '@/lib/utils';

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { href: '#how-it-works', label: 'How it works' },
      { href: '/pricing.html', label: 'Pricing' },
      { href: '/dashboard.html', label: 'My plans' }
    ]
  },
  {
    heading: 'Account',
    links: [
      { href: '/login.html', label: 'Sign in' },
      { href: '/login.html?signup=1', label: 'Plan My Week Free' },
      { href: '/reset-password.html', label: 'Reset password' }
    ]
  },
  {
    heading: 'Legal',
    links: [
      { href: '/privacy-policy.html', label: 'Privacy Policy' },
      { href: '/terms.html', label: 'Terms' },
      { href: 'mailto:support@mealzy.org', label: 'Contact' }
    ]
  }
];

const TRUST_BADGES = [
  'Powered by USDA Nutrition Data',
  'Deterministic Grocery Engine',
  'Over 10,000 meals planned'
];

export default function Footer() {
  return (
    <footer className="border-t border-forest-line bg-forest-deep py-14 text-on-forest">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <a href="/" aria-label="Mealzy home" className="font-display text-2xl font-black italic text-on-forest no-underline">
              Mealzy
            </a>
            <p className="mt-4 max-w-xs text-sm leading-[1.6] text-on-forest-muted">
              A full week of meals, priced to your budget, in 30 seconds.
            </p>
            <p className="mt-3 max-w-xs text-sm leading-[1.6] text-on-forest-muted">
              Used in 10 countries, in 11 languages.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h4 className="text-xs font-bold uppercase tracking-[0.08em] text-on-forest-muted">{col.heading}</h4>
              <ul role="list" className="mt-4 flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      onClick={l.href.startsWith('#') ? (e) => scrollToHash(e, l.href) : undefined}
                      className="text-[15px] text-on-forest-body no-underline transition-colors duration-200 hover:text-on-forest"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <ul
          role="list"
          aria-label="What Mealzy runs on"
          className="mt-12 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-forest-line pt-6 text-sm text-on-forest-body"
        >
          {TRUST_BADGES.map((badge, i) => (
            <li key={badge} className="flex items-center gap-3">
              {i > 0 && <span aria-hidden="true" className="h-1 w-1 rounded-full bg-on-forest-faint" />}
              <span>{badge}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 text-xs leading-[1.6] text-on-forest-muted">
          <p>&copy; 2026 Mealzy. Nutritional calculations aligned with USDA dietary guidelines.</p>
          <p className="mt-1">Mealzy is an AI tool and does not provide medical or nutritional advice.</p>
        </div>
      </div>
    </footer>
  );
}
