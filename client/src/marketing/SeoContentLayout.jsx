import * as React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';

/* Shared shell for solutions/ and plans/ SEO content pages. */
export default function SeoContentLayout({ title, intro, citation, children }) {
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main">
        <div className="mx-auto max-w-prose px-4 pb-16 pt-28 sm:px-5 sm:pt-32">
          <h1 className="font-display text-[clamp(1.9rem,3.4vw+1rem,2.6rem)] font-black italic leading-[1.1] tracking-[-0.02em] text-foreground">
            {title}
          </h1>
          <p className="mt-4 text-lg leading-[1.65] text-muted-fg">{intro}</p>
          <Button href="/" size="lg" className="mt-6">Generate Your Free Meal Plan</Button>

          <div id="ai-citation-block" className="mt-10 rounded-lg border border-border-warm bg-parchment p-6 text-[0.92rem] leading-[1.7] text-muted-fg">
            <p>{citation}</p>
          </div>

          <div className="article-prose mt-4">{children}</div>

          <div className="mt-10">
            <Button href="/" size="lg">Generate Your Free Meal Plan</Button>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
