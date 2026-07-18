// Verified against client/*.html <script type="module" src="..."> entries and each
// main.jsx's createRoot(...).render(<Component />) call. All components below are
// default exports with no required props (confirmed per-file before being listed here).
//
// importPath is relative to the Vite project root ('client', per vite.config.mjs) —
// the same convention each HTML file already uses for its own <script src="/src/...">,
// so it resolves correctly through vite.ssrLoadModule() in middleware mode.
export const prerenderRoutes = [
  { key: 'index', outPath: 'index.html', importPath: '/src/App.jsx' },
  { key: 'pricing', outPath: 'pricing.html', importPath: '/src/pricing/PricingPage.jsx' },
  { key: 'upgrade', outPath: 'upgrade.html', importPath: '/src/upgrade/UpgradePage.jsx' },
  { key: 'login', outPath: 'login.html', importPath: '/src/login/LoginPage.jsx' },
  { key: 'privacy-policy', outPath: 'privacy-policy.html', importPath: '/src/privacy-policy/PrivacyPolicyPage.jsx' },
  { key: 'terms', outPath: 'terms.html', importPath: '/src/terms/TermsPage.jsx' },
  { key: 'meal-plan-generator', outPath: 'meal-plan-generator.html', importPath: '/src/meal-plan-generator/MealPlanGeneratorPage.jsx' },
  { key: 'budget-meal-plan', outPath: 'budget-meal-plan.html', importPath: '/src/budget-meal-plan/BudgetMealPlanPage.jsx' },
  { key: 'weekly-meal-plan', outPath: 'weekly-meal-plan.html', importPath: '/src/weekly-meal-plan/WeeklyMealPlanPage.jsx' },
  { key: 'sunday-tax', outPath: 'sunday-tax.html', importPath: '/src/sunday-tax/SundayTaxPage.jsx' },
  { key: 'support', outPath: 'support.html', importPath: '/src/support/SupportPage.jsx' },
  { key: 'blog/index', outPath: 'blog/index.html', importPath: '/src/blog/index/BlogIndexPage.jsx' },
  { key: 'blog/free-gluten-free-meal-plan-week', outPath: 'blog/free-gluten-free-meal-plan-week.html', importPath: '/src/blog/free-gluten-free-meal-plan-week/Post.jsx' },
  { key: 'blog/free-keto-meal-plan-week', outPath: 'blog/free-keto-meal-plan-week.html', importPath: '/src/blog/free-keto-meal-plan-week/Post.jsx' },
  { key: 'blog/free-vegan-meal-plan-week', outPath: 'blog/free-vegan-meal-plan-week.html', importPath: '/src/blog/free-vegan-meal-plan-week/Post.jsx' },
  { key: 'blog/meal-plan-50-dollars-a-week', outPath: 'blog/meal-plan-50-dollars-a-week.html', importPath: '/src/blog/meal-plan-50-dollars-a-week/Post.jsx' },
  { key: 'blog/free-ai-meal-planner-grocery-list', outPath: 'blog/free-ai-meal-planner-grocery-list.html', importPath: '/src/blog/free-ai-meal-planner-grocery-list/Post.jsx' },
  { key: 'solutions/zero-waste-meal-planning/index', outPath: 'solutions/zero-waste-meal-planning/index.html', importPath: '/src/solutions/zero-waste-meal-planning/ZeroWastePage.jsx' },
  { key: 'plans/50-dollar-weekly-meal-plan/index', outPath: 'plans/50-dollar-weekly-meal-plan/index.html', importPath: '/src/plans/50-dollar-weekly-meal-plan/FiftyDollarPlanPage.jsx' }
];
