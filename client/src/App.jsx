import * as React from 'react';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import DemoResult from '@/components/DemoResult';
import Showcase from '@/components/Showcase';
import Comparison from '@/components/Comparison';
import Proof from '@/components/Proof';
import HowItWorks from '@/components/HowItWorks';
import FeaturesGrid from '@/components/FeaturesGrid';
import Founder from '@/components/Founder';
import Faq from '@/components/Faq';
import ClosingCta from '@/components/ClosingCta';
import EmailPopup from '@/components/EmailPopup';
import InteractiveOnboarding from '@/components/InteractiveOnboarding';
import Footer from '@/components/Footer';
import { generateDemoMeal, track, captureReferral } from '@/lib/api';

export default function App() {
  const [demo, setDemo] = React.useState({ status: 'idle', plan: null, error: null, rateLimited: false, cals: 2000, budget: 60 });
  /* Owned here because the two CTAs that open it — the hero's and the mobile
   * sticky bar inside Showcase — sit in different subtrees. */
  const [onboarding, setOnboarding] = React.useState(false);
  const startPlan = React.useCallback(() => setOnboarding(true), []);

  const bootRan = React.useRef(false);
  React.useEffect(() => {
    if (bootRan.current) return; // StrictMode double-invokes effects in dev
    bootRan.current = true;
    captureReferral();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  const runDemo = async ({ calorieGoal, budget, dietary }) => {
    setDemo((d) => ({ ...d, status: 'loading', error: null }));
    try {
      const plan = await generateDemoMeal({ calorieGoal, budget, dietary });
      setDemo({ status: 'success', plan, error: null, rateLimited: false, cals: calorieGoal, budget });
      track('demo_generated', { cals: calorieGoal, budget, diet: dietary });
    } catch (err) {
      setDemo((d) => ({
        ...d,
        status: 'error',
        error: err.message || 'Something went wrong. Please try again.',
        rateLimited: !!err.rateLimited
      }));
    }
  };

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main">
        <Hero onGenerate={runDemo} generating={demo.status === 'loading'} onStartPlan={startPlan} />
        <DemoResult demo={demo} />
        <Showcase onStartPlan={startPlan} />
        <Comparison />
        <Proof />
        <HowItWorks />
        <FeaturesGrid />
        <Founder />
        <Faq />
        <ClosingCta />
      </main>
      <InteractiveOnboarding open={onboarding} onOpenChange={setOnboarding} />
      <EmailPopup />
      <Footer />
    </>
  );
}
