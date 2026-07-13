import * as React from 'react';
import Reveal from '@/components/Reveal';

const WEEK = [
  ['Mon', ['Greek Yogurt Parfait', 320], ['Quinoa Buddha Bowl', 480], ['Herb-Crusted Salmon', 540]],
  ['Tue', ['Avocado Toast', 290], ['Lentil Soup', 380], ['Chicken Stir-Fry', 490]],
  ['Wed', ['Oat Porridge & Berries', 310], ['Greek Salad & Pitta', 350], ['Beef & Black Bean Tacos', 520]],
  ['Thu', ['Scrambled Eggs on Rye', 280], ['Roasted Tomato Soup', 320], ['Pasta Pomodoro', 560]],
  ['Fri', ['Banana Smoothie Bowl', 250], ['Tuna & Corn Wrap', 420], ['Coconut Veggie Curry', 480]],
  ['Sat', ['French Toast', 380], ['Caesar Salad', 410], ['Roast Chicken & Veg', 620]],
  ['Sun', ['Blueberry Pancakes', 420], ['Mushroom Risotto', 450], ['Baked Cod & Greens', 460]]
];

const GROCERIES = [
  ['Produce', [
    ['Cherry tomatoes', '$3.40'], ['Baby spinach 200 g', '$2.30'], ['Avocados ×3', '$3.90'],
    ['Lemons ×4', '$1.90'], ['Garlic bulb', '$0.70']
  ]],
  ['Protein', [
    ['Chicken breast 600 g', '$7.90'], ['Salmon fillet 400 g', '$9.60'],
    ['Greek yogurt 500 g', '$3.20'], ['Free-range eggs ×12', '$3.40']
  ]],
  ['Pantry', [
    ['Quinoa 250 g', '$2.90'], ['Red lentils 400 g', '$2.10'],
    ['Pasta 400 g', '$1.60'], ['Olive oil 500 ml', '$5.20']
  ]]
];

function MealCell({ name, kcal }) {
  return (
    <td className="px-3 py-2.5 align-top">
      <span className="block text-[15px] font-medium leading-snug">{name}</span>
      <span className="text-xs text-muted-fg">{kcal} kcal</span>
    </td>
  );
}

export default function Showcase() {
  return (
    <section id="features" aria-labelledby="showcase-heading" className="bg-parchment py-16 sm:py-20">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        <Reveal className="mx-auto mb-12 max-w-prose text-center">
          <h2
            id="showcase-heading"
            className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]"
          >
            Your week, planned and ready to shop.
          </h2>
          <p className="mt-4 text-[17px] leading-[1.7] text-muted-fg">
            One plan, one list, one trip to the store. Every meal is counted, every ingredient is priced.
          </p>
        </Reveal>

        <div className="grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
          <Reveal className="min-w-0 rounded-lg border border-border-warm bg-cream shadow-card">
            <div className="flex items-baseline justify-between border-b border-border-warm px-5 py-4">
              <strong className="font-display text-lg font-bold italic">The week</strong>
              <span className="text-sm text-muted-fg">7 days · 2,100 kcal/day target</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left" aria-label="Sample weekly meal plan">
                <thead>
                  <tr className="border-b border-border-warm text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">
                    <th scope="col" className="px-3 py-3 pl-5">Day</th>
                    <th scope="col" className="px-3 py-3">Breakfast</th>
                    <th scope="col" className="px-3 py-3">Lunch</th>
                    <th scope="col" className="px-3 py-3">Dinner</th>
                  </tr>
                </thead>
                <tbody>
                  {WEEK.map(([day, b, l, d]) => (
                    <tr key={day} className="border-b border-hairline last:border-b-0">
                      <td className="px-3 py-2.5 pl-5 align-top font-display text-base font-bold italic text-green">{day}</td>
                      <MealCell name={b[0]} kcal={b[1]} />
                      <MealCell name={l[0]} kcal={l[1]} />
                      <MealCell name={d[0]} kcal={d[1]} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>

          <Reveal delay={100} className="min-w-0 rounded-lg border border-border-warm bg-cream p-6 shadow-card">
            <h3 className="font-display text-2xl font-bold leading-[1.15] tracking-[-0.01em]">The grocery list</h3>
            {GROCERIES.map(([cat, items]) => (
              <React.Fragment key={cat}>
                <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.08em] text-green-deep dark:text-green-light">{cat}</p>
                {items.map(([item, price]) => (
                  <div key={item} className="flex items-baseline py-1 text-[15px]">
                    <span>{item}</span>
                    <span className="receipt-dots" aria-hidden="true" />
                    <span className="font-medium tabular-nums">{price}</span>
                  </div>
                ))}
              </React.Fragment>
            ))}
            <div className="mt-5 flex items-baseline justify-between border-t border-border-warm pt-4 text-base font-bold">
              <span>Week total</span>
              <span className="tabular-nums">$48.10</span>
            </div>
            <p className="mt-2 rounded-sm bg-green/10 px-3 py-2 text-sm font-semibold text-green-deep dark:text-green-light">
              $11.90 under your $60 budget.
            </p>
          </Reveal>
        </div>

        <Reveal delay={200} as="p" className="mt-8 text-center text-sm text-muted-fg">
          Generated in about 30 seconds from your preferences. List shown is an excerpt.
        </Reveal>
      </div>
    </section>
  );
}
