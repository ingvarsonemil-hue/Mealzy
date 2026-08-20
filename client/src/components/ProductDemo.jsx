import * as React from 'react';
import Reveal from '@/components/Reveal';
import { Sunrise, Bowl, Cutlery, Check } from '@/components/icons';

/* Static browser-chrome mockup of the dashboard — a fixed illustration, not a
 * live plan. Numbers are representative, not computed, so this stays a fast
 * import with no data dependency on the real generator. */

const MEAL_DAYS = [
  {
    day: 'Monday',
    meals: [
      { Icon: Sunrise, name: 'Greek Yogurt & Berries', course: 'Breakfast', cost: '$2.15' },
      { Icon: Bowl, name: 'Chicken Burrito Bowl', course: 'Lunch', cost: '$4.85' },
      { Icon: Cutlery, name: 'Beef Stir Fry', course: 'Dinner', cost: '$6.20' }
    ]
  },
  {
    day: 'Tuesday',
    meals: [
      { Icon: Sunrise, name: 'Avocado Toast & Eggs', course: 'Breakfast', cost: '$3.10' },
      { Icon: Bowl, name: 'Turkey Club Sandwich', course: 'Lunch', cost: '$3.50' },
      { Icon: Cutlery, name: 'Baked Salmon & Rice', course: 'Dinner', cost: '$7.80' }
    ]
  }
];

const GROCERY_CATEGORIES = [
  {
    label: 'Produce',
    items: [
      { name: 'Mixed Berries', amount: '200g', cost: '$3.50' },
      { name: 'Avocados', amount: '2 items', cost: '$2.00' }
    ]
  },
  {
    label: 'Protein & Meat',
    items: [
      { name: 'Chicken Breast', amount: '500g', cost: '$6.20' },
      { name: 'Salmon Fillets', amount: '400g', cost: '$8.80' },
      { name: 'Ground Beef', amount: '300g', cost: '$4.50' }
    ]
  },
  {
    label: 'Pantry',
    items: [
      { name: 'Brown Rice', amount: '1 bag', cost: '$2.80' },
      { name: 'Tortilla Wraps', amount: '1 pack', cost: '$2.50' }
    ]
  }
];

function MealRow({ Icon, name, course, cost }) {
  return (
    <div className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-hairline py-2.5 last:border-b-0">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted-bg text-muted-fg">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
        <span className="block text-xs text-muted-fg">{course}</span>
      </span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{cost}</span>
    </div>
  );
}

function GroceryRow({ name, amount, cost }) {
  return (
    <div className="grid grid-cols-[20px_1fr_auto_auto] items-center gap-3 border-b border-hairline py-2.5 last:border-b-0">
      <span className="flex h-4 w-4 items-center justify-center rounded bg-green text-white">
        <Check className="h-2.5 w-2.5" />
      </span>
      <span className="min-w-0 truncate text-sm font-medium text-foreground">{name}</span>
      <span className="text-xs tabular-nums text-muted-fg">{amount}</span>
      <span className="min-w-[40px] text-right text-sm font-semibold tabular-nums text-foreground">{cost}</span>
    </div>
  );
}

export default function ProductDemo() {
  return (
    <Reveal as="section" className="mx-auto max-w-container px-6 pb-24">
      <div className="overflow-hidden rounded-lg border border-border-warm bg-cream shadow-lg">
        <div className="flex items-center gap-4 border-b border-border-warm bg-muted-bg px-4 py-3">
          <span className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-border-warm" />
            <span className="h-3 w-3 rounded-full bg-border-warm" />
            <span className="h-3 w-3 rounded-full bg-border-warm" />
          </span>
          <span className="flex-grow rounded-md border border-border-warm bg-cream py-1 text-center font-body text-xs text-muted-fg">
            app.mealzy.org/dashboard
          </span>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 items-center gap-4 rounded-md border border-green/25 bg-green/10 px-6 py-5 text-center sm:grid-cols-[1fr_2fr_1fr] sm:gap-8 sm:text-left">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-green-deep dark:text-green-light">
                Weekly Budget
              </span>
              <span className="text-2xl font-bold tabular-nums tracking-tight text-green-deep dark:text-green-light">
                $100.00
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs font-semibold text-foreground">
                <span className="font-medium text-muted-fg">Planned Spend</span>
                <span className="tabular-nums">$87.50</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full border border-green/25 bg-cream">
                <div className="h-full rounded-full bg-green" style={{ width: '87.5%' }} />
              </div>
            </div>

            <div className="flex flex-col gap-1 sm:items-end">
              <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-green-deep dark:text-green-light">
                Remaining
              </span>
              <span className="text-2xl font-bold tabular-nums tracking-tight text-green-deep dark:text-green-light">
                $12.50
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-md border border-border-warm bg-cream p-5">
              <div className="mb-4 flex items-center justify-between border-b border-hairline pb-4">
                <h3 className="font-display text-base font-bold tracking-tight text-foreground">
                  This Week&apos;s Meals
                </h3>
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-fg">
                  7-Day Plan
                </span>
              </div>
              {MEAL_DAYS.map(({ day, meals }) => (
                <div key={day} className="mb-5 last:mb-0">
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.05em] text-green-deep dark:text-green-light">
                    {day}
                  </div>
                  {meals.map((meal) => (
                    <MealRow key={meal.name} {...meal} />
                  ))}
                </div>
              ))}
            </div>

            <div className="rounded-md border border-border-warm bg-cream p-5">
              <div className="mb-4 flex items-center justify-between border-b border-hairline pb-4">
                <h3 className="font-display text-base font-bold tracking-tight text-foreground">
                  Grocery List
                </h3>
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-fg">
                  Auto-Generated
                </span>
              </div>
              {GROCERY_CATEGORIES.map(({ label, items }) => (
                <div key={label} className="mb-5 last:mb-0">
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.05em] text-muted-fg">
                    {label}
                  </div>
                  {items.map((item) => (
                    <GroceryRow key={item.name} {...item} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
