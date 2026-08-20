import ProductDemo from '@/components/ProductDemo';
import ClosingCta from '@/components/ClosingCta';
import * as React from 'react';
import Header from '@/components/Header';
import FounderStory from '@/components/FounderStory';
import Hero from '@/components/Hero';
import Showcase from '@/components/Showcase';
import TrustBar from '@/components/TrustBar';
import HowItWorks from '@/components/HowItWorks';
import FeaturesGrid from '@/components/FeaturesGrid';
import WhyMealzy from '@/components/WhyMealzy';
import Faq from '@/components/Faq';
import InteractiveOnboarding from '@/components/InteractiveOnboarding';
import Footer from '@/components/Footer';
import { captureReferral } from '@/lib/api';
import { BASE_BUDGET, DIETS } from '@/components/showcase-plan';

const DEFAULT_HOUSEHOLD = 2;
export default function App() {
  const [budget, setBudget] = React.useState(BASE_BUDGET);
  const [planBudget, setPlanBudget] = React.useState(BASE_BUDGET);
  const [dietId, setDietId] = React.useState(DIETS[0].id);

  React.useEffect(() => {
    if (budget === planBudget) return undefined;
    const t = setTimeout(() => setPlanBudget(budget), 250);
    return () => clearTimeout(t);
  }, [budget, planBudget]);

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

  const [onboarding, setOnboarding] = React.useState(false);
  const [seed, setSeed] = React.useState(null);
  const startPlan = React.useCallback((targets) => {
    if (targets) setSeed(targets);
    setOnboarding(true);
  }, []);

  const bootRan = React.useRef(false);
  React.useEffect(() => {
    if (bootRan.current) return;
    bootRan.current = true;
    captureReferral();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header ctaHref={secondaryCtaHref} />
      
      {/* We added gap-12 and md:gap-16 here to tighten the vertical whitespace between sections by ~20-30% */}
      <main id="main" className="flex flex-col gap-12 md:gap-16">
        <Hero onStartPlan={startPlan} ctaHref={secondaryCtaHref} />
        
        <ProductDemo />
        
        <Showcase
          onStartPlan={startPlan}
          budget={budget}
          planBudget={planBudget}
          onBudgetChange={setBudget}
          ctaHref={secondaryCtaHref}
        />
        <TrustBar />
        <HowItWorks />
        <FeaturesGrid />
        <WhyMealzy />
        
        {/* FounderStory moved here (lower down) */}
        <FounderStory /> 
        
        <Faq />
        
        {/* Replaced the old ClosingCta with our new FinalCTA */}
       <ClosingCta ctaHref={secondaryCtaHref} />
      </main>
      
      <InteractiveOnboarding open={onboarding} onOpenChange={setOnboarding} seed={seed} />
      <Footer ctaHref={secondaryCtaHref} />
    </>
  );
}