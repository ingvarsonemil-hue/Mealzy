/**
 * Maps the backend-facing `WeekPlan` (see @/lib/plan) onto the
 * `PlanCurrentViewModel` that `PlanCurrentView` renders.
 *
 * Pure display mapping only: formatting, picking which day to show, and
 * carrying real numbers through. It does not decide entitlement, does not
 * call generation, and does not invent business logic (e.g. it never
 * guesses which meals "share ingredients" - that would be a real generation
 * -level computation the backend does not currently expose, so
 * `usesIngredientsElsewhere` is always left undefined here).
 *
 * Known gaps versus the locked design, all because the current WeekPlan
 * contract does not carry the field (not something this adapter can fix):
 *   - PlanMealViewModel.durationMinutes: no prep-time field on PlanMeal.
 *   - BudgetViewModel.target: no numeric weekly budget target on WeekPlan
 *     (only the opaque `weeklyTotals.budgetStatus` string).
 *   - GroceryViewModel.itemCount: no grocery-list count anywhere yet (see
 *     mobile/src/app/shop.tsx - groceries are not generated server-side yet).
 *   - PlanMealViewModel.usesIngredientsElsewhere: no cross-meal overlap
 *     signal from the backend.
 */

import type { PlanDay, WeekPlan } from '@/lib/plan';
import type {
  BudgetViewModel,
  PlanCurrentViewModel,
  PlanDayViewModel,
  PlanMealViewModel,
  WeekSelectorDayViewModel,
} from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseYmdLocal(s: string): Date | null {
  const [y, m, d] = s.split('-').map((n) => Number(n));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** "Sep 7–13" when the week stays in one month, "Sep 28 – Oct 4" otherwise. */
function formatRangeLabel(days: PlanDay[]): string {
  if (days.length === 0) return '';
  const start = parseYmdLocal(days[0].date);
  const end = parseYmdLocal(days[days.length - 1].date);
  if (!start || !end) return '';

  const startLabel = `${MONTHS[start.getMonth()]} ${start.getDate()}`;
  if (start.getMonth() === end.getMonth()) return `${startLabel}–${end.getDate()}`;
  return `${startLabel} – ${MONTHS[end.getMonth()]} ${end.getDate()}`;
}

function toSelectorDays(days: PlanDay[], selectedIndex: number): WeekSelectorDayViewModel[] {
  return days.map((day, i) => {
    const date = parseYmdLocal(day.date);
    return {
      label: day.dayName ? day.dayName.charAt(0).toUpperCase() : '?',
      dayOfMonth: date ? date.getDate() : 0,
      iso: day.date,
      isSelected: i === selectedIndex,
    };
  });
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function toMealViewModels(day: PlanDay): PlanMealViewModel[] {
  return day.meals.map((meal, i) => ({
    id: `${day.date}-${i}`,
    type: capitalize(meal.type || 'meal'),
    name: meal.name,
    // durationMinutes intentionally omitted: not in the backend contract.
    estimatedCost: meal.cost,
    calories: Math.round(meal.calories),
    proteinGrams: Math.round(meal.protein),
    // usesIngredientsElsewhere intentionally omitted: see file header.
  }));
}

function toBudget(week: WeekPlan): BudgetViewModel {
  return {
    estimated: week.weeklyTotals.totalCost,
    // target intentionally omitted: no numeric weekly budget in WeekPlan.
    statusLabel: week.weeklyTotals.budgetStatus,
  };
}

/**
 * Which day to display. Phase A does not implement day switching, so this
 * just picks "today" if it falls within the week, else the first day.
 */
function selectedDayIndex(days: PlanDay[], today: Date): number {
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  const i = days.findIndex((d) => d.date === todayIso);
  return i >= 0 ? i : 0;
}

export function toPlanCurrentViewModel(week: WeekPlan, today: Date = new Date()): PlanCurrentViewModel {
  const index = selectedDayIndex(week.days, today);
  const day: PlanDay | undefined = week.days[index];

  const dayViewModel: PlanDayViewModel = {
    dayName: day?.dayName || '',
    meals: day ? toMealViewModels(day) : [],
  };

  return {
    rangeLabel: formatRangeLabel(week.days),
    selectorDays: toSelectorDays(week.days, index),
    day: dayViewModel,
    budget: toBudget(week),
    groceries: {
      // itemCount intentionally omitted: see file header.
      estimatedCost: week.weeklyTotals.totalCost,
    },
  };
}
