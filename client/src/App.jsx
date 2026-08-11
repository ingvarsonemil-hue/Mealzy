import * as React from 'react';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Showcase from '@/components/Showcase';
import HowItWorks from '@/components/HowItWorks';
import FeaturesGrid from '@/components/FeaturesGrid';
import Faq from '@/components/Faq';
import ClosingCta from '@/components/ClosingCta';
import InteractiveOnboarding from '@/components/InteractiveOnboarding';
import Footer from '@/components/Footer';
import { captureReferral } from '@/lib/api';
import { BASE_BUDGET, DIETS } from '@/components/showcase-plan';

/* Household isn't asked anywhere above the modal — the hero form deliberately
 * leaves it out (see InteractiveOnboarding) — so secondary CTAs that skip the
 * modal fall back to this rather than inventing a value nobody chose. */
const DEFAULT_HOUSEHOLD = 2;

export default function App() {
  /* One budget for the page, reachable from two places: the hero field and the
   * showcase slider. They are handles on this single piece of state rather than
   * two numbers kept in step, so a visitor cannot end up disagreeing with
   * themselves — typing $90 up top moves the slider below, and dragging the
   * slider rewrites the field.
   *
   * `budget` follows the handle keystroke by keystroke — the slider and the
   * dollar figure beside it have to stay live under the thumb. `planBudget`
   * lags it by 250ms, and it is the one the plan is rebuilt from: a drag across
   * the full $20–$300 slider is 56 steps, and re-planning seven days, 21 meals
   * and a priced grocery list on every one of them is what made dragging feel
   * like sand. */
  const [budget, setBudget] = React.useState(BASE_BUDGET);
  const [planBudget, setPlanBudget] = React.useState(BASE_BUDGET);
  /* Diet lives here too, not just inside the hero form, so the secondary CTAs
   * below (nav, footer, closing band) can carry the same choice into the URL
   * without duplicating the hero's state. */
  const [dietId, setDietId] = React.useState(DIETS[0].id);

  React.useEffect(() => {
    if (budget === planBudget) return undefined;
    const t = setTimeout(() => setPlanBudget(budget), 250);
    return () => clearTimeout(t);
  }, [budget, planBudget]);

  /* Secondary "Build My Plan" buttons (nav, footer, closing band) don't run
   * the interactive modal — it needs a household size the visitor hasn't been
   * asked for yet up there. They still carry whatever the hero form already
   * knows, so the login page isn't starting from zero. */
  const secondaryCtaHref = React.useMemo(() => {
    const diet = DIETS.find((d) => d.id === dietId) || DIETS[0];
    const params = new URLSearchParams({
      signup: '1',
      budget: String(budget),
      dietary: diet.signup,
      household: String(DEFAULT_HOUSEHOLD)
    });
    return `login.html?${params}`;
  }, [budget, dietId]);
  /* Owned here because the two CTAs that open it — the hero's and the mobile
   * sticky bar inside Showcase — sit in different subtrees. The hero passes
   * the targets it collected; the mobile bar has none to pass. */
  const [onboarding, setOnboarding] = React.useState(false);
  const [seed, setSeed] = React.useState(null);
  const startPlan = React.useCallback((targets) => {
    if (targets) setSeed(targets);
    setOnboarding(true);
  }, []);

  const bootRan = React.useRef(false);
  React.useEffect(() => {
    if (bootRan.current) return; // StrictMode double-invokes effects in dev
    bootRan.current = true;
    captureReferral();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header ctaHref={secondaryCtaHref} />
      <main id="main">
        <Hero
          onStartPlan={startPlan}
          budget={budget}
          onBudgetChange={setBudget}
          dietId={dietId}
          onDietChange={setDietId}
        />
        {/* The sample plan is the demo. There is no second, separately generated
          * preview to keep in step with it — one week, one set of numbers. */}
        <Showcase
          onStartPlan={startPlan}
          budget={budget}
          planBudget={planBudget}
          onBudgetChange={setBudget}
        />
        <HowItWorks />
        <FeaturesGrid />
        <Faq />
        <ClosingCta ctaHref={secondaryCtaHref} />
      </main>
      <InteractiveOnboarding open={onboarding} onOpenChange={setOnboarding} seed={seed} />
      <Footer ctaHref={secondaryCtaHref} />
    </>
  );
}
