/* Stripe payment-link URLs, injected by the server route /stripe-config.js
 * (see server.js — values come from env vars, falling back to the monthly
 * link). That script is loaded as a BLOCKING <script> in the page <head>:
 * with `defer` it can run after page code reads window.STRIPE_*, which has
 * caused silent wrong-URL checkout routing (annual toggle charging monthly).
 * Belt and suspenders: these getters also read lazily at call time instead
 * of capturing values at module init.
 */

const FALLBACK_MONTHLY = 'https://buy.stripe.com/28E28r1Q73q0e6neQRffy00';

export const stripeUrls = {
  get monthly() { return window.STRIPE_MONTHLY || FALLBACK_MONTHLY; },
  get annual() { return window.STRIPE_ANNUAL || this.monthly; },
  /* Family and the abandonment discount must never fall back to the Pro
   * monthly link — that would charge (or promise) the wrong price. null
   * means "not configured"; callers must check the matching *Ready flag
   * before using these. */
  get familyMonthly() { return window.STRIPE_FAMILY_MONTHLY || null; },
  get familyAnnual() { return window.STRIPE_FAMILY_ANNUAL || null; },
  get discount() { return window.STRIPE_DISCOUNT || null; },
  /* True only when STRIPE_ANNUAL_URL is actually configured server-side.
   * When false, "annual" would silently resolve to the monthly link and charge
   * the wrong amount, so the billing toggle renders with its annual segment
   * disabled rather than routing a visitor to a price they weren't shown. */
  get annualReady() { return !!window.STRIPE_ANNUAL_READY; },
  get familyMonthlyReady() { return !!window.STRIPE_FAMILY_MONTHLY_READY; },
  get familyAnnualReady() { return !!window.STRIPE_FAMILY_ANNUAL_READY; },
  get discountReady() { return !!window.STRIPE_DISCOUNT; }
};

/* Single source of truth for what each plan costs. The monthly and annual
 * totals are the only figures typed by hand — the "Save X%" badge and the
 * "$N less than monthly" line are derived, so a price edit can never leave a
 * stale percentage behind on one page and not another. (Pro annual has been
 * written as both $62 and $130 in past commits; deriving stops the drift.) */
const plan = (monthly, annualTotal) => ({
  monthly,
  annualTotal,
  monthlyLabel: `$${monthly}`,
  annualLabel: `$${annualTotal}`,
  savePct: Math.round((1 - annualTotal / (monthly * 12)) * 100),
  saveAmount: monthly * 12 - annualTotal
});

export const PLAN_PRICING = {
  pro: plan(8, 62),
  family: plan(16, 128)
};

/* Price + period + savings line for one plan in one billing mode, so every
 * card reads the same three values from the same place. */
export function planDisplay(key, mode) {
  const p = PLAN_PRICING[key];
  const yearly = mode === 'yearly';
  return {
    price: yearly ? p.annualLabel : p.monthlyLabel,
    period: yearly ? '/year' : '/month',
    billed: yearly ? `Save ${p.savePct}% — $${p.saveAmount} less than monthly` : ''
  };
}
