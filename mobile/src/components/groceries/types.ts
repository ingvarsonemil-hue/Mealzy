/**
 * View-model types for the locked Groceries design (`GroceriesView`).
 * Mirrors the pattern in @/components/plan/types.ts: separate from the
 * backend-facing WeeklyPurchasePlan so this presentational layer never has
 * to know the server's shape.
 */

export type GroceryItemViewModel = {
  id: string;
  name: string;
  /** Real purchase-amount display (e.g. "2 × 907g", "450g"). Omitted when the backend couldn't price this ingredient. */
  quantityLabel?: string;
  /**
   * Stable identity for checked-state persistence - the same canonical id
   * the backend keys on. Null for an unresolved ingredient, which has no
   * stable identity and so cannot support a persisted checkmark; those rows
   * render non-interactive rather than offering a checkbox that silently
   * can't save (see shop.tsx).
   */
  canonicalIngredientId: string | null;
};

export type GrocerySectionViewModel = {
  /** Raw backend bucket key (produce/protein/dairy/grains/pantry/frozen/beverages/other) - stable identity for the section, e.g. as a React key. */
  category: string;
  /** Restrained display label, e.g. "MEAT & PROTEIN" - see groceries-adapter.ts's CATEGORY_LABELS. */
  label: string;
  items: GroceryItemViewModel[];
};

export type GrocerySummaryViewModel = {
  totalCount: number;
  /** Undefined only if the backend sent no purchase plan at all. */
  estimatedCost?: number;
  /** true when estimatedCost is the fully-certified total; false when it's the best-effort, non-certified total. */
  isCertified: boolean;
};

export type GroceriesViewModel = {
  /** e.g. "Sep 7–13" */
  rangeLabel: string;
  summary: GrocerySummaryViewModel;
  sections: GrocerySectionViewModel[];
};
