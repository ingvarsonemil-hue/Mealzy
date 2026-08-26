'use strict';

/**
 * MANUAL SUPERMARKET OBSERVATIONS — Grocery Units + Unknown Pricing v2 audit.
 *
 * NOT authoritative universal market prices. This is a small, hand-recorded
 * sample from comparing 5 real Mealzy grocery lists (107 ingredient-price
 * observations total) against one shopper's real supermarket equivalents on
 * one occasion, in one region. It exists as REGRESSION/PRIORITIZATION
 * EVIDENCE — proof that a failure class (the $0.50 fallback, a unit
 * mismatch) actually happened and roughly how large it was — never as a
 * source of truth to backfill ingredient_prices.js rows from. Do not treat
 * `observedRealUSD` as a price to copy into production data.
 *
 * `mealzyBehavior` records what mechanism produced the Mealzy number, per
 * the Grocery Units + Unknown Pricing v2 Phase A trace — not just the dollar
 * figure — so this fixture stays useful evidence even as the underlying
 * code changes.
 */

const MANUAL_OBSERVATIONS = [
  { ingredient: 'venison steak',  mealzyUSD: 0.50, observedRealUSD: 9.59, mealzyBehavior: 'unknown_ingredient (no price row) — fixed portion of Phase B: now explicitly flagged, still $0.50 (coverage gap, not fixed)' },
  { ingredient: 'lean chuck meat', mealzyUSD: 0.50, observedRealUSD: 3.82, mealzyBehavior: 'unknown_ingredient (no price row) — coverage gap, remains unresolved' },
  { ingredient: 'shrimp',          mealzyUSD: 0.50, observedRealUSD: 0.90, mealzyBehavior: 'unknown_ingredient (no price row) — coverage gap, remains unresolved' },
  { ingredient: 'hummus',          mealzyUSD: 0.50, observedRealUSD: 1.05, mealzyBehavior: 'unknown_ingredient (no price row) — coverage gap, remains unresolved' },
  { ingredient: 'eggplant',        mealzyUSD: 0.50, observedRealUSD: 1.05, mealzyBehavior: 'unknown_ingredient (no price row) — coverage gap, remains unresolved' },
  { ingredient: 'feta',            mealzyUSD: 0.50, observedRealUSD: 0.75, mealzyBehavior: 'unknown_ingredient (no price row) — coverage gap, remains unresolved' },
  { ingredient: 'honey',           mealzyUSD: 0.50, observedRealUSD: 0.10, mealzyBehavior: 'FIXED in this PR: was unsupported_unit (prompt says liquid->ml, price row is $/g) — now converts via a documented 1.42 g/ml density and prices VERIFIED' },
  { ingredient: 'broth',           mealzyUSD: 0.50, observedRealUSD: 0.08, mealzyBehavior: 'likely unknown_ingredient — generated name ("chicken broth") does not match the only broth row ("vegetable broth"); coverage gap, remains unresolved' },
  { ingredient: 'rice',            mealzyUSD: 0.50, observedRealUSD: 0.24, mealzyBehavior: 'plausible unit/name mismatch on the observed occurrence — not reproduced from a live sample; remains unresolved' },
  { ingredient: 'rosemary',        mealzyUSD: 0.50, observedRealUSD: 0.29, mealzyBehavior: 'unknown_ingredient (no price row) — coverage gap, remains unresolved' },
  { ingredient: 'greek yogurt',    mealzyUSD: 1.35,  observedRealUSD: 0.72, mealzyBehavior: 'Price Calibration Audit (2026-08-26, 2nd/final gate pass): traced VERIFIED, price-row cause confirmed (0.00675/g x 200g = 1.35, exact). A 4-observation named-retailer evidence set (Great Value, Chobani, FAGE whole, FAGE 2%) gave mean $0.0066/g and median $0.0071/g - much closer to the original rate than the first pass\'s single-anchor $0.0045/g estimate - so the row was recalibrated only modestly, to 0.0065/g, see ingredientPriceData.js' },
  { ingredient: 'spinach',         mealzyUSD: 1.80,  observedRealUSD: 1.26, mealzyBehavior: 'Price Calibration Audit (2026-08-26): traced VERIFIED, price-row cause confirmed (0.012/g x 150g = 1.80, exact). External evidence was MIXED (bagged retail runs above this rate, bulk loose runs below it) so the row was left UNCHANGED - insufficient evidence to recalibrate' },
  { ingredient: 'olive oil',       mealzyUSD: 0.68,  observedRealUSD: 0.46, mealzyBehavior: 'Price Calibration Audit (2026-08-26): traced VERIFIED, price-row cause confirmed (0.015/ml x 45ml = 0.675 -> 0.68, exact). External evidence (Kirkland/Bertolli/Pompeian EVOO) sat AT OR ABOVE this rate, contradicting the overpriced hypothesis, so the row was left UNCHANGED' },
  { ingredient: 'chicken breast',  mealzyUSD: null,  observedRealUSD: null, mealzyBehavior: 'generally close per the audit — left untouched, per "do not fix functioning rows"' },
  { ingredient: 'eggs',            mealzyUSD: null,  observedRealUSD: null, mealzyBehavior: 'generally close per the audit; display improved in this PR (named count, e.g. "3 eggs") without changing pricing' },
];

module.exports = { MANUAL_OBSERVATIONS };
