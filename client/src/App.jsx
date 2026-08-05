import * as React from 'react';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Showcase from '@/components/Showcase';
import Proof from '@/components/Proof';
import HowItWorks from '@/components/HowItWorks';
import FeaturesGrid from '@/components/FeaturesGrid';
import Faq from '@/components/Faq';
import ClosingCta from '@/components/ClosingCta';
import InteractiveOnboarding from '@/components/InteractiveOnboarding';
import Footer from '@/components/Footer';
import { captureReferral } from '@/lib/api';
import { BASE_BUDGET } from '@/components/showcase-plan';

export default function App() {
  /* One budget for the page. The hero form and the showcase slider are two
   * handles on the same number, so dragging either re-plans the whole preview
   * and a visitor never sets their budget twice. */
  const [budget, setBudget] = React.useState(BASE_BUDGET);
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
        <Hero onStartPlan={startPlan} budget={budget} onBudgetChange={setBudget} />
        {/* The sample plan is the demo. There is no second, separately generated
          * preview to keep in step with it — one week, one set of numbers. */}
        <Showcase onStartPlan={startPlan} budget={budget} onBudgetChange={setBudget} />
        <Proof />
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
