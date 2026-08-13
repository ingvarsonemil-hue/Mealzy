import * as React from 'react';
import { scrollToHash, cn } from '@/lib/utils';

function columnsFor(ctaHref) {
  return [
    {
      heading: 'Product',
      links: [
        { href: '#how-it-works', label: 'How it works' },
        { href: '/pricing.html', label: 'Pricing' },
        { href: '/dashboard.html', label: 'Your plans (sign in)', muted: true }
      ]
    },
    {
      heading: 'Account',
      links: [
        { href: '/login.html', label: 'Sign in' },
        { href: ctaHref, label: 'Build My Free Plan' },
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
}

/* Plain statements of what the numbers are, in place of the engineering-sounding
 * labels that used to sit here ("Deterministic Grocery Engine", "Powered by USDA
 * Nutrition Data") — they described the plumbing rather than telling a visitor
 * anything they could act on. */
const TRUST_BADGES = [
  'Prices estimated from regional grocery data.',
  'Every price calculated, not guessed'
];

export default function Footer({ ctaHref = '/login.html?signup=1' }) {
  const COLUMNS = columnsFor(ctaHref);
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
            {/* The one time claim the site is held to, stated the same way in
              * the hero and in How it works. */}
            <p className="mt-2 max-w-xs text-sm leading-[1.6] text-on-forest-muted">
              3-minute setup. 30 seconds every week after.
            </p>
            {/* The prices in full, where someone looking for them last will
              * look. No tier is named here that the pricing page doesn't
              * charge exactly this for. */}
            <p className="mt-3 max-w-xs text-sm leading-[1.6] text-on-forest-muted">
              Free for 3 plans a month. Pro $8/mo or $62/yr. Family $16/mo or $128/yr.{' '}
              <a
                href="/pricing.html"
                className="font-semibold text-on-forest underline decoration-from-font underline-offset-2"
              >
                See full pricing
              </a>
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
                      className={cn(
                        'text-[15px] no-underline transition-colors duration-200 hover:text-on-forest',
                        l.muted ? 'text-on-forest-muted' : 'text-on-forest-body'
                      )}
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
          aria-label="How Mealzy prices a plan"
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
          <p>&copy; 2026 Mealzy &mdash; Sweden.</p>
          <p className="mt-1">Nutritional calculations aligned with USDA dietary guidelines.</p>
          <p className="mt-1">Mealzy is an AI tool and does not provide medical or nutritional advice.</p>
        </div>
      </div>
    </footer>
  );
}
