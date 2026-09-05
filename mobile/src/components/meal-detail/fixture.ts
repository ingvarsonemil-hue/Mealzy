import type { MealDetailViewModel } from './types';

/**
 * Static view-model fixture matching the locked Meal Detail design's exact
 * sample content. Not imported by any production route - only for rendering
 * MealDetailView in isolation during UI work (mirrors
 * @/components/plan/fixture.ts's purpose for PlanCurrentView).
 *
 * Ingredients/instructions below are NOT fabricated to "fill out" the
 * fixture - the locked design spec did not provide sample ingredient/
 * instruction content, so this fixture only reproduces the fields the spec
 * actually gave exact values for, leaving the rest empty. It exists to
 * exercise the hero/nutrition/cost portion of the design, not the full list
 * layout.
 */
export const mealDetailViewModelFixture: MealDetailViewModel = {
  id: 'fixture-dinner',
  type: 'Dinner',
  name: 'Creamy tomato pasta',
  dayLabel: 'Monday, Sep 7',
  durationMinutes: 30,
  estimatedCost: 6.1,
  calories: 620,
  proteinGrams: 27,
  carbsGrams: 82,
  fatGrams: 19,
  ingredients: [],
  instructions: [],
};
