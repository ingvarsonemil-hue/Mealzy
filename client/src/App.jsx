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
import { BASE_BUDGET } from '@/components/showcase-plan';

export default function App() {
  /* One budget for the page, and now one control for it: the showcase slider.
   * The hero form used to carry a second slider onto the same number, which
   * meant two handles a visitor could disagree with themselves on.
   *
   * `budget` follows the handle keystroke by keystroke — the slider and the
   * dollar figure beside it have to stay live under the thumb. `planBudget`
   * lags it by 250ms, and it is the one the plan is rebuilt from: a drag from
   * $40 to $120 is 17 steps, and re-planning seven days, 21 meals and a priced
   * grocery list on every one of them is what made dragging feel like sand. */
  const [budget, setBudget] = React.useState(BASE_BUDGET);
  const [planBudget, setPlanBudget] = React.useState(BASE_BUDGET);

  React.useEffect(() => {
    if (budget === planBudget) return undefined;
    const t = setTimeout(() => setPlanBudget(budget), 250);
    return () => clearTimeout(t);
  }, [budget, planBudget]);
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
      <Header />
      <main id="main">
        {/* The hero reads the budget for the modal seed; it no longer sets it. */}
        <Hero onStartPlan={startPlan} budget={budget} />
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
        <ClosingCta />
      </main>
      <InteractiveOnboarding open={onboarding} onOpenChange={setOnboarding} seed={seed} />
      <Footer />
    </>
  );
}
