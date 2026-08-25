// Plan-level budget truthfulness (Grocery Units + Unknown Pricing v2).
//
// Pure, DOM-free so it's directly unit-testable (see
// tests/budgetConfidenceDisplay.test.js) — the only file in this pair with
// document access is groceries-ui.js, which just wires this function's
// output into the DOM.
//
// A grocery list's `budgetStatus` (see budgetEngine.classifyBudgetStatus)
// says whether EVERY ingredient in the list was priced from Mealzy's own
// dataset. Green "you're fine" styling is only earned by 'certified' — a
// list that hit the unknown-price fallback for even one ingredient can show
// an identical dollar figure while the true cost is unknowable, so it gets
// a neutral color and a compact, non-alarming disclosure instead.
function getBudgetConfidenceDisplay(status, remaining) {
  if (remaining < 0 || status === 'over_budget') {
    return { color: 'var(--clr-error)', note: '' };
  }
  if (status === 'certified') {
    return { color: 'var(--color-green)', note: '' };
  }
  if (status === 'estimated_with_unknowns') {
    return { color: 'var(--clr-warning)', note: 'Some ingredient prices are estimates, not yet in Mealzy\'s price dataset.' };
  }
  if (status === 'not_enforced') {
    return { color: 'var(--clr-muted-fg)', note: 'Budget tracking isn\'t available for this currency yet.' };
  }
  // Missing/unrecognized status (e.g. a list saved before this field
  // existed) — never defaults to a confident green just because the field
  // is absent.
  return { color: 'var(--clr-muted-fg)', note: '' };
}

/** Whether a single grocery row should carry the "estimate" badge.
 * priceSource is only trustworthy as dataset-priced when it's the exact
 * string 'verified' — 'unknown_ingredient'/'unsupported_unit'/
 * 'legacy_estimate' all mean the cost is a guess, never inferred from the
 * dollar value itself (see pricing.js). Once a user enters a real
 * actualCost, the row reflects what they actually saw at the store, so the
 * badge no longer applies. */
function isEstimatedGroceryRow(item) {
  return !!(item && item.priceSource && item.priceSource !== 'verified' && !item.actualCost);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getBudgetConfidenceDisplay, isEstimatedGroceryRow };
}
