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
  get familyMonthly() { return window.STRIPE_FAMILY_MONTHLY || this.monthly; },
  get familyAnnual() { return window.STRIPE_FAMILY_ANNUAL || this.monthly; },
  get discount() { return window.STRIPE_DISCOUNT || this.monthly; },
  /* True only when STRIPE_ANNUAL_URL is actually configured server-side.
   * When false, "annual" would silently resolve to the monthly link, so the
   * upgrade page hides the billing toggle entirely (legacy contract). */
  get annualReady() { return !!window.STRIPE_ANNUAL_READY; }
};
