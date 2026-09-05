/**
 * Maps a real PlanMeal (see @/lib/plan) onto the MealDetailViewModel that
 * MealDetailView renders.
 *
 * ROUTING LIMITATION (read before changing the route): there is no
 * backend-issued meal/recipe id anywhere in the current contract - meals
 * only ever exist embedded in a week's plan response, and there is no
 * `/api/meals/:id`-style lookup endpoint to resolve one against. Inventing
 * an id here would imply a permanence and shareability (deep links,
 * bookmarks) that don't exist.
 *
 * So Meal Detail (src/app/meal-detail.tsx) takes only `date` and `mealIndex`
 * as route params - no recipe content. It re-loads the current week itself
 * via the existing read-only `fetchSavedWeek` (@/lib/plan-api), the same
 * call index.tsx already uses, finds the matching day by `date` and the
 * meal by position, and calls `toMealDetailViewModel` here locally. This
 * function never touches routing or navigation params itself.
 */

import type { PlanDay, PlanMeal } from '@/lib/plan';
import { formatDayLabel } from '@/lib/date-format';
import type { IngredientViewModel, MealDetailViewModel } from './types';

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function toIngredientViewModels(meal: PlanMeal): IngredientViewModel[] {
  return meal.ingredients.map((ingredient, i) => ({
    id: `${ingredient.name}-${i}`,
    name: ingredient.name,
    quantity: ingredient.amount.length > 0 ? ingredient.amount : undefined,
  }));
}

export function toMealDetailViewModel(day: PlanDay, mealIndex: number): MealDetailViewModel | null {
  const meal = day.meals[mealIndex];
  if (!meal) return null;

  return {
    id: `${day.date}-${mealIndex}`,
    type: capitalize(meal.type || 'meal'),
    name: meal.name,
    dayLabel: formatDayLabel(day.dayName, day.date),
    durationMinutes: meal.cookTime > 0 ? meal.cookTime : undefined,
    estimatedCost: meal.cost,
    calories: typeof meal.calories === 'number' ? Math.round(meal.calories) : undefined,
    proteinGrams: typeof meal.protein === 'number' ? Math.round(meal.protein) : undefined,
    carbsGrams: typeof meal.carbs === 'number' ? Math.round(meal.carbs) : undefined,
    fatGrams: typeof meal.fat === 'number' ? Math.round(meal.fat) : undefined,
    ingredients: toIngredientViewModels(meal),
    instructions: meal.instructions,
  };
}
