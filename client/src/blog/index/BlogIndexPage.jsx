import * as React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

/* PAGE COPY — copied verbatim from public/blog/index.html.
 * Do not rewrite, reword, or "improve" any sentence here without sign-off. */

const POSTS = [
  {
    date: 'June 16, 2026',
    href: '/blog/free-gluten-free-meal-plan-week.html',
    title: 'Free 7-Day Gluten-Free Meal Plan With Grocery List',
    desc: 'A complete 7-day gluten-free meal plan using whole foods and naturally gluten-free ingredients. No hidden gluten sources, budget-friendly, and a free AI tool to generate a custom gluten-free plan in under 1 minute.'
  },
  {
    date: 'June 16, 2026',
    href: '/blog/free-keto-meal-plan-week.html',
    title: 'Free 7-Day Keto Meal Plan With Grocery List',
    desc: 'A complete 7-day keto meal plan under 20g net carbs per day, with calorie totals, keto protein sources, full grocery list, and a free AI tool to generate a custom version in under 1 minute.'
  },
  {
    date: 'June 16, 2026',
    href: '/blog/free-vegan-meal-plan-week.html',
    title: 'Free Vegan Meal Plan for the Week — 7 Days + Grocery List',
    desc: 'A complete 7-day vegan meal plan with calorie totals, vegan protein sources, full grocery list, and a free AI tool to generate a custom version in under 1 minute.'
  },
  {
    date: 'June 16, 2026',
    href: '/blog/meal-plan-50-dollars-a-week.html',
    title: 'How to Meal Plan on $50 a Week (With a Free AI Planner)',
    desc: 'The exact method to hit $50/week on groceries — sample meal plan, cheap protein sources, and a free AI tool that builds your weekly plan automatically.'
  },
  {
    date: 'June 16, 2026',
    href: '/blog/free-ai-meal-planner-grocery-list.html',
    title: 'Free AI Meal Planner With Grocery List: The Complete Guide (2026)',
    desc: 'How AI meal planners work, why the grocery list feature matters, how Mealzy compares to paid alternatives like Eat This Much and PlateJoy, and honest tips for getting the most out of your plan.'
  }
];

export default function BlogIndexPage() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main">
        <div className="mx-auto max-w-prose px-4 pb-6 pt-28 text-center sm:px-5 sm:pt-32">
          <h1 className="font-display text-[2rem] font-bold italic text-foreground">Mealzy Blog</h1>
          <p className="mt-2 text-lg text-muted-fg">Meal planning tips, guides, and AI insights — free and useful.</p>
        </div>

        <div className="mx-auto max-w-prose px-4 pb-16 sm:px-5">
          {POSTS.map((p) => (
            <article key={p.href} className="mb-8 rounded-lg border border-border-warm bg-cream p-8 shadow-sm transition-shadow duration-200 hover:shadow-md">
              <div className="mb-2 text-sm text-muted-fg">{p.date}</div>
              <h2 className="mb-3 font-display text-xl font-bold italic">
                <a href={p.href} className="text-foreground no-underline hover:text-green">{p.title}</a>
              </h2>
              <p className="mb-5 leading-[1.7] text-muted-fg">{p.desc}</p>
              <a href={p.href} className="font-semibold text-green no-underline hover:underline">Read article →</a>
            </article>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
