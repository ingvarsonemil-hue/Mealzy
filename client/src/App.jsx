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
import Footer from '@/components/Footer';
import { generateDemoMeal, track, captureReferral } from '@/lib/api';

export default function App() {
  const [demo, setDemo] = React.useState({ status: 'idle', plan: null, error: null, rateLimited: false, cals: 2000, budget: 60 });

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
        <Hero onGenerate={runDemo} generating={demo.status === 'loading'} />
        <DemoResult demo={demo} />
        <Showcase />
        <Comparison />
        <Proof />
        <HowItWorks />
        <FeaturesGrid />
        <Founder />
        <Faq />
        <ClosingCta />
      </main>
      <EmailPopup />
      <Footer />
    </>
  );
}
