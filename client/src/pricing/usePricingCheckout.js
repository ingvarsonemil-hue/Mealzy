import { useEffect, useState } from 'react';
import { stripeUrls } from '@/lib/stripe';
import { track, trackReliable } from '@/lib/api';

/* Account + Stripe-config guard shared by every paid CTA on the pricing page.
 *
 * accountState:
 *   'pending'     — /api/auth/me hasn't resolved yet. No purchase CTA (never
 *                    flash a checkout link before we know who's asking).
 *   'purchasable' — anonymous (401/403) or authenticated-but-free. Anonymous
 *                    checkout is accepted, existing behavior: the Stripe
 *                    webhook already activates Pro purely by matching
 *                    checkout_session.customer_details.email against a
 *                    Mealzy account (server.js), the same mechanism
 *                    public/upgrade.html already relies on for anonymous
 *                    visitors today. Not new risk — just reused.
 *   'pro'         — server-confirmed Pro. No purchase CTA, ever.
 *   'error'       — /api/auth/me failed. Fail safe: no purchase CTA rather
 *                    than risk a double purchase or a wrong-state CTA.
 *
 * stripeReady mirrors the same "default to the SSR/prerender-safe value,
 * correct after mount" pattern already used by UpgradePage.jsx and
 * PaywallPage.jsx, so hydration never disagrees with the prerendered markup.
 * Pro-monthly always has a real fallback link (see stripeUrls.monthly) so it
 * needs no readiness flag; annual and Family links do not, and must never
 * silently resolve to a different plan/interval's price.
 */
export function usePricingCheckout() {
  const [accountState, setAccountState] = useState('pending');
  const [stripeReady, setStripeReady] = useState({
    annualReady: false,
    familyMonthlyReady: false,
    familyAnnualReady: false
  });

  useEffect(() => {
    setStripeReady({
      annualReady: stripeUrls.annualReady,
      familyMonthlyReady: stripeUrls.familyMonthlyReady,
      familyAnnualReady: stripeUrls.familyAnnualReady
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let res;
      try {
        res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      } catch (e) {
        if (!cancelled) setAccountState('error');
        return;
      }
      if (res.status === 401 || res.status === 403) {
        if (!cancelled) setAccountState('purchasable');
        return;
      }
      if (!res.ok) {
        if (!cancelled) setAccountState('error');
        return;
      }
      let data;
      try { data = await res.json(); } catch (e) { if (!cancelled) setAccountState('error'); return; }
      if (!cancelled) setAccountState(data && data.pro === true ? 'pro' : 'purchasable');
    })();
    return () => { cancelled = true; };
  }, []);

  return { accountState, stripeReady };
}

/* Single place that decides which real Stripe URL (if any) a plan+billing
 * combination should use. Never falls back across plans or intervals —
 * "not ready" always means no href, never a wrong href. */
export function getCheckoutInfo(planId, billing, stripeReady) {
  if (planId === 'pro') {
    if (billing === 'monthly') return { href: stripeUrls.monthly, ready: true };
    return stripeReady.annualReady
      ? { href: stripeUrls.annual, ready: true }
      : { href: null, ready: false };
  }
  if (planId === 'family') {
    if (billing === 'monthly') {
      return stripeReady.familyMonthlyReady
        ? { href: stripeUrls.familyMonthly, ready: true }
        : { href: null, ready: false };
    }
    return stripeReady.familyAnnualReady
      ? { href: stripeUrls.familyAnnual, ready: true }
      : { href: null, ready: false };
  }
  return { href: null, ready: false };
}

/* checkout_started uses trackReliable — the click navigates away (new tab),
 * so a plain fetch could be aborted mid-flight. upgrade_click is the
 * existing generic funnel event (source/billing shape, see
 * tests/authenticated-funnel-identity.test.js) — reused here with
 * source: 'pricing_page' rather than inventing a parallel event. */
export function trackCheckoutClick(tier, billing) {
  track('upgrade_click', { source: 'pricing_page', billing });
  trackReliable('checkout_started', { tier, billing });
}
