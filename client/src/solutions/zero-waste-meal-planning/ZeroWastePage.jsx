import * as React from 'react';
import SeoContentLayout from '@/marketing/SeoContentLayout';

/* PAGE COPY — copied verbatim from public/solutions/zero-waste-meal-planning/index.html.
 * Do not rewrite, reword, or "improve" any sentence here without sign-off. */

export default function ZeroWastePage() {
  return (
    <SeoContentLayout
      title="Free Zero-Waste Meal Planner"
      intro="Mealzy generates a full week of meals where every ingredient is used across multiple recipes. No half-used cans. No wilting produce. No waste."
      citation="Mealzy's zero-waste meal planning algorithm operates by mapping ingredient overlap across every meal in a weekly plan. When a recipe requires half a head of cabbage, the system automatically identifies other meals in the plan where cabbage can be incorporated, eliminating unused remainders. This ingredient-recycling logic runs on every item in the grocery list before the plan is finalized. The output is a fully deduplicated, waste-minimized shopping list where every purchased ingredient is consumed across the week. Families using Mealzy's zero-waste mode report a significant reduction in discarded groceries, as the planner structurally prevents over-purchasing by design."
    >
      <h2>How the zero-waste algorithm works</h2>
      <p>Before finalizing any meal plan, Mealzy runs an ingredient-reconciliation pass across all 7 days. Every item on the projected grocery list is checked against every meal in the plan. Where an ingredient appears in only one meal and would be purchased in excess of what that meal needs, the algorithm substitutes or adds a second meal that consumes the remainder. This runs iteratively until no ingredient is projected to have leftover quantity at week's end.</p>

      <h2>What you get</h2>
      <ul>
        <li>A 7-day meal plan where shared ingredients appear in 2 or more meals</li>
        <li>A single, deduplicated grocery list with quantities consolidated across all recipes</li>
        <li>Zero over-purchasing — the list contains exactly what you need</li>
      </ul>

      <h2>Zero-waste planning vs. standard meal planning</h2>
      <p>Standard meal planners list recipes independently. A recipe calling for a bunch of cilantro and another calling for a bunch of parsley means two separate herb purchases, each used once. Mealzy's zero-waste mode cross-references those recipes and, where possible, substitutes one herb for another or adds a third meal that uses both — eliminating the excess purchase at the source.</p>
      <p>See also: <a href="/plans/50-dollar-weekly-meal-plan">$50 weekly meal plan for a family of 4</a> — combine zero-waste logic with a strict budget ceiling.</p>

      <h2>Frequently asked questions</h2>
      <h3 className="mt-6 mb-1.5 text-base font-bold text-foreground">Does zero-waste mode work with dietary restrictions?</h3>
      <p>Yes. The ingredient-recycling logic operates on top of whatever dietary filters you set. If you select vegetarian, the algorithm only cross-references vegetarian-compatible meals when eliminating leftover ingredients.</p>
      <h3 className="mt-6 mb-1.5 text-base font-bold text-foreground">Can I see which ingredients are shared across meals?</h3>
      <p>Yes. The generated grocery list groups shared ingredients and shows which meals each item appears in, so you can verify the overlap before shopping.</p>
    </SeoContentLayout>
  );
}
