/**
 * View-model types for the locked Plan Current design (`PlanCurrentView`).
 *
 * Deliberately separate from the backend-facing domain types in
 * `@/lib/plan` (WeekPlan/PlanMeal/etc.), which mirror the server contract
 * exactly. `plan-current-adapter.ts` maps one to the other so this
 * presentational layer never has to know the backend's shape.
 */

export type WeekSelectorDayViewModel = {
  /** Single-letter day label, e.g. 'M', 'T'. Not required to be unique. */
  label: string;
  dayOfMonth: number;
  /** ISO date (YYYY-MM-DD) for this day. */
  iso: string;
  isSelected: boolean;
};

export type PlanMealViewModel = {
  id: string;
  /** e.g. 'Breakfast', 'Lunch', 'Dinner'. Shown verbatim. */
  type: string;
  name: string;
  /**
   * Prep time in minutes. The backend's PlanMeal contract does not currently
   * include this field, so real data will always leave it undefined; the
   * fixture provides it so the locked design can still be reviewed in full.
   */
  durationMinutes?: number;
  /** undefined when the backend didn't send a valid cost - never shown as $0. */
  estimatedCost?: number;
  calories?: number;
  proteinGrams?: number;
  /**
   * Not derivable from the current backend contract (no cross-meal
   * ingredient-overlap signal is sent). Always undefined for real data.
   */
  usesIngredientsElsewhere?: boolean;
};

export type PlanDayViewModel = {
  dayName: string;
  meals: PlanMealViewModel[];
};

export type BudgetViewModel = {
  estimated: number;
  /**
   * The user's numeric weekly budget target. Not exposed by the current
   * WeekPlan contract (only an opaque `budgetStatus` string is), so real
   * data always leaves this undefined.
   */
  target?: number;
  /** target - estimated, only set when `target` is known. */
  remaining?: number;
  /** Opaque backend string (WeekWeeklyTotals.budgetStatus), shown verbatim when there's no numeric target. */
  statusLabel?: string;
};

export type GroceryViewModel = {
  /** Real item count (weeklyTotals.purchasePlan.rows.length) - see plan-current-adapter.ts's Phase C note. Undefined only if the backend sent no purchase plan at all. */
  itemCount?: number;
  /** Real purchase-cost estimate, same source as itemCount. Undefined under the same condition. */
  estimatedCost?: number;
};

export type PlanCurrentViewModel = {
  /** e.g. "Sep 7–13" */
  rangeLabel: string;
  selectorDays: WeekSelectorDayViewModel[];
  day: PlanDayViewModel;
  budget: BudgetViewModel;
  groceries: GroceryViewModel;
};
