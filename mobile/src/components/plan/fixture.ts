import type { PlanCurrentViewModel } from './types';

/**
 * Static view-model fixture for `PlanCurrentView`, matching the locked
 * design's exact sample content. Not imported by index.tsx or any
 * production route: its purpose is rendering `PlanCurrentView` in isolation
 * during UI work (e.g. temporarily swapping it into a screen, or a future
 * component test), since real backend data currently cannot populate every
 * field the locked design calls for (see the gaps noted in ./types.ts and
 * ./plan-current-adapter.ts).
 */
export const planCurrentViewModelFixture: PlanCurrentViewModel = {
  rangeLabel: 'Sep 7–13',
  selectorDays: [
    { label: 'M', dayOfMonth: 7, iso: '2026-09-07', isSelected: true },
    { label: 'T', dayOfMonth: 8, iso: '2026-09-08', isSelected: false },
    { label: 'W', dayOfMonth: 9, iso: '2026-09-09', isSelected: false },
    { label: 'T', dayOfMonth: 10, iso: '2026-09-10', isSelected: false },
    { label: 'F', dayOfMonth: 11, iso: '2026-09-11', isSelected: false },
    { label: 'S', dayOfMonth: 12, iso: '2026-09-12', isSelected: false },
    { label: 'S', dayOfMonth: 13, iso: '2026-09-13', isSelected: false },
  ],
  day: {
    dayName: 'Monday',
    meals: [
      {
        id: 'breakfast',
        type: 'Breakfast',
        name: 'Cinnamon apple oats',
        durationMinutes: 20,
        estimatedCost: 2.4,
        calories: 420,
        proteinGrams: 21,
        swapped: false,
      },
      {
        id: 'lunch',
        type: 'Lunch',
        name: 'Sesame chicken rice bowl',
        durationMinutes: 25,
        estimatedCost: 3.8,
        calories: 510,
        proteinGrams: 34,
        usesIngredientsElsewhere: true,
        swapped: false,
      },
      {
        id: 'dinner',
        type: 'Dinner',
        name: 'Creamy tomato pasta',
        durationMinutes: 30,
        estimatedCost: 6.1,
        calories: 620,
        proteinGrams: 27,
        swapped: false,
      },
    ],
  },
  budget: {
    estimated: 64.8,
    target: 70,
    remaining: 5.2,
  },
  groceries: {
    itemCount: 23,
    estimatedCost: 64.8,
  },
};
