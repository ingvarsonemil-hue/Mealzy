import * as React from 'react';
import { scrollToHash } from '@/lib/utils';

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { href: '#how-it-works', label: 'How it works' },
      { href: 'pricing.html', label: 'Pricing' },
      { href: '/dashboard.html', label: 'My plans' }
    ]
  },
  {
    heading: 'Account',
    links: [
      { href: 'login.html', label: 'Sign in' },
      { href: 'login.html?signup=1', label: 'Start Planning Free' },
      { href: 'reset-password.html', label: 'Reset password' }
    ]
  },
  {
    heading: 'Legal',
    links: [
      { href: 'privacy-policy.html', label: 'Privacy Policy' },
      { href: 'terms.html', label: 'Terms' },
      { href: 'mailto:support@mealzy.org', label: 'Contact' }
    ]
  }
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
              AI meal planning that fits your budget, your diet, and your week — in 30 seconds flat.
            </p>
            <p className="mt-3 max-w-xs text-sm leading-[1.6] text-on-forest-muted">
              Used in 10 countries including Sweden, the USA, Germany, and Canada.
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
        <div className="mt-12 border-t border-forest-line pt-6 text-xs leading-[1.6] text-on-forest-muted">
          <p>&copy; 2026 Mealzy &mdash; Built by Emil, 16, Sweden. Nutritional calculations aligned with USDA dietary guidelines.</p>
          <p className="mt-1">Mealzy is an AI tool and does not provide medical or nutritional advice.</p>
        </div>
      </div>
    </footer>
  );
}
