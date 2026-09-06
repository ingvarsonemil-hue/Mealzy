'use strict';

/**
 * Shared grocery-category taxonomy. Extracted out of groceryAggregation.js
 * (Phase C: mobile Groceries) so weeklyPurchasePlan.js can use the exact
 * same authoritative bucket mapping without groceryAggregation.js and
 * weeklyPurchasePlan.js requiring each other (groceryAggregation.js already
 * requires weeklyPurchasePlan.js for the Phase 2 purchase-economics
 * re-export - a require cycle the other way must be avoided).
 *
 * The 8-key bucket list is the taxonomy grocery UIs group by. The 5-key map
 * is what actually gets classified upstream (ingredient_prices.category via
 * pricing.js, and canonicalIngredients.js's per-record `category`) - both
 * draw from the same small closed vocabulary, so one mapping function
 * safely serves both.
 */

const GROCERY_CATEGORY_KEYS = ['produce', 'protein', 'dairy', 'grains', 'pantry', 'frozen', 'beverages', 'other'];

const RAW_CATEGORY_TO_GROCERY_BUCKET = { meat: 'protein', protein: 'protein', dairy: 'dairy', produce: 'produce', pantry: 'pantry' };

/** Anything unmapped (including no category at all) lands in 'other' rather than guessing. */
function groceryBucketFor(rawCategory) {
  return RAW_CATEGORY_TO_GROCERY_BUCKET[rawCategory] || 'other';
}

module.exports = {
  GROCERY_CATEGORY_KEYS,
  groceryBucketFor,
};
