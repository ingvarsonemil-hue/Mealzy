import ClosingCta from '@/components/ClosingCta';
import * as React from 'react';
import Header from '@/components/Header';
import FounderStory from '@/components/FounderStory';
import Hero from '@/components/Hero';
import Showcase from '@/components/Showcase';
import TrustBar from '@/components/TrustBar';
import HowItWorks from '@/components/HowItWorks';
import WhyMealzy from '@/components/WhyMealzy';
import Faq from '@/components/Faq';
import Footer from '@/components/Footer';
import { captureReferral, track } from '@/lib/api';

/* Every top-of-funnel CTA on the page points at the inline mini pre-onboarding
 * inside Showcase (client/src/components/Showcase.jsx) rather than straight to
 * signup — Showcase is now the site's one pre-onboarding flow, and only its
 * own "Build my real week" CTA (reached after budget/diet/time are answered)
 * carries selections into login.html. */
const SHOWCASE_HREF = '#showcase';

export default function App() {
  const bootRan = React.useRef(false);
  React.useEffect(() => {
    if (bootRan.current) return;
    bootRan.current = true;
    captureReferral();
    track('homepage_viewed', {});
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header ctaHref={SHOWCASE_HREF} />

      {/* We added gap-12 and md:gap-16 here to tighten the vertical whitespace between sections by ~20-30% */}
      <main id="main" className="flex flex-col gap-12 md:gap-16">
        <Hero />

        <Showcase />
        {/* "Recipes vs. budget" differentiation right after the demo, then the
            single three-step workflow, then the objection-answering numbers
            section — each idea told once, in the order a new visitor decides. */}
        <WhyMealzy />
        <HowItWorks />
        <TrustBar />
        <FounderStory />
        <Faq />
        <ClosingCta ctaHref={SHOWCASE_HREF} />
      </main>

      <Footer ctaHref={SHOWCASE_HREF} />
    </>
  );
}
