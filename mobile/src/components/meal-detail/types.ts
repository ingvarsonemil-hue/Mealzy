/**
 * View-model types for the locked Meal Detail design (`MealDetailView`).
 * Mirrors the pattern in @/components/plan/types.ts: separate from the
 * backend-facing PlanMeal so this presentational layer never has to know
 * the server's shape.
 */

export type IngredientViewModel = {
  id: string;
  name: string;
  /** Human-readable quantity (e.g. "200g", "2 eggs"). Omitted when unknown. */
  quantity?: string;
};

export type MealDetailViewModel = {
  /**
   * Synthetic, same-plan-render-only key (date + meal index). Not a backend
   * identifier - see the routing note in meal-detail-adapter.ts.
   */
  id: string;
  /** e.g. 'Breakfast', 'Lunch', 'Dinner'. Shown verbatim (uppercased in the eyebrow). */
  type: string;
  name: string;
  /** e.g. "Monday, Sep 7" */
  dayLabel: string;
  /** Minutes. Undefined when the backend didn't provide one. */
  durationMinutes?: number;
  /** undefined when the backend didn't send a valid cost - never shown as $0. */
  estimatedCost?: number;
  calories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
  ingredients: IngredientViewModel[];
  instructions: string[];
};
