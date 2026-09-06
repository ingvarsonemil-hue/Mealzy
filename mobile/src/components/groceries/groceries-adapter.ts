/**
 * Maps the real WeekPlan (see @/lib/plan) onto the GroceriesViewModel that
 * GroceriesView renders.
 *
 * DATA SOURCE: weeklyTotals.purchasePlan (weeklyPurchasePlan.js) - the whole
 * week's ingredients aggregated by canonical identity, rounded UP to real
 * store package sizes, and priced in integer cents. This is genuine
 * PURCHASE/package economics, not the separate per-day recipe-consumption
 * grocery-list system (/api/generate-grocery-list) - see @/lib/plan's
 * Phase C note for the full rationale.
 *
 * Categories (Phase C backend follow-up) come straight from
 * purchasePlan.rows[i].category - server.js's own groceryCategories.js
 * bucket mapping (the same one the per-day system uses), never a
 * client-side guess. CATEGORY_ORDER/CATEGORY_LABELS below are presentation
 * only (which section shows first, and its restrained label) and mirror
 * groceryCategories.js's GROCERY_CATEGORY_KEYS order.
 */

import type { WeekPlan, GroceryPurchaseRow } from '@/lib/plan';
import { formatDateRangeLabel } from '@/lib/date-format';
import type {
  GroceriesViewModel,
  GroceryItemViewModel,
  GrocerySectionViewModel,
  GrocerySummaryViewModel,
} from './types';

/** Mirrors groceryCategories.js's GROCERY_CATEGORY_KEYS order. */
const CATEGORY_ORDER = ['produce', 'protein', 'dairy', 'grains', 'pantry', 'frozen', 'beverages', 'other'];

/** Restrained section labels (locked design). Any backend category outside this map still gets a truthful, non-fabricated label: its own name, uppercased. */
const CATEGORY_LABELS: Record<string, string> = {
  produce: 'PRODUCE',
  dairy: 'DAIRY & EGGS',
  pantry: 'PANTRY',
  protein: 'MEAT & PROTEIN',
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.toUpperCase();
}

/**
 * The real purchase amount for one row, never the raw recipe-consumption
 * quantity. Undefined when the backend couldn't price this ingredient
 * (unresolved name, no purchase profile, unit mismatch, invalid quantity) -
 * never fabricated as a fallback.
 */
function formatQuantityLabel(row: GroceryPurchaseRow): string | undefined {
  if (row.packageType === 'variable_weight') {
    if (row.purchaseQuantity === null || !row.purchaseUnit) return undefined;
    return `${row.purchaseQuantity}${row.purchaseUnit}`;
  }
  if (row.packageCount === null || row.packageQuantity === null || !row.packageUnit) return undefined;
  return `${row.packageCount} × ${row.packageQuantity}${row.packageUnit}`;
}

function toItemViewModel(row: GroceryPurchaseRow, i: number): GroceryItemViewModel {
  return {
    id: `${row.name}-${i}`,
    name: row.name,
    quantityLabel: formatQuantityLabel(row),
    canonicalIngredientId: row.canonicalIngredientId,
  };
}

/** Groups rows into ordered sections by their real backend category, preserving each row's original relative order within its section. */
function toSections(rows: GroceryPurchaseRow[]): GrocerySectionViewModel[] {
  const byCategory = new Map<string, GroceryItemViewModel[]>();
  rows.forEach((row, i) => {
    const list = byCategory.get(row.category) ?? [];
    list.push(toItemViewModel(row, i));
    byCategory.set(row.category, list);
  });

  const ordered = [...CATEGORY_ORDER, ...[...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c))];
  return ordered
    .filter((category) => byCategory.has(category))
    .map((category) => ({ category, label: categoryLabel(category), items: byCategory.get(category)! }));
}

function toSummary(week: WeekPlan, itemCount: number): GrocerySummaryViewModel {
  const plan = week.weeklyTotals.purchasePlan;
  if (!plan) return { totalCount: itemCount, isCertified: false };

  if (plan.allCovered && plan.certifiedEstimatedPurchaseCostCents !== null) {
    return {
      totalCount: itemCount,
      estimatedCost: plan.certifiedEstimatedPurchaseCostCents / 100,
      isCertified: true,
    };
  }
  // Best-effort total - server.js's own comment on weeklyPurchaseCostCents
  // calls this "observability only, never certified". Still genuine
  // purchase-cost arithmetic, never a recipe-consumption sum.
  return {
    totalCount: itemCount,
    estimatedCost: plan.weeklyPurchaseCostCents > 0 ? plan.weeklyPurchaseCostCents / 100 : undefined,
    isCertified: false,
  };
}

export function toGroceriesViewModel(week: WeekPlan): GroceriesViewModel {
  const rows = week.weeklyTotals.purchasePlan?.rows ?? [];
  const sections = toSections(rows);

  return {
    rangeLabel: week.days.length > 0 ? formatDateRangeLabel(week.days[0].date, week.days[week.days.length - 1].date) : '',
    summary: toSummary(week, rows.length),
    sections,
  };
}
