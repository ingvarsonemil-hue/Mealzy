import * as React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

/* Shared wrapper for every blog post page. */
export default function BlogArticleShell({ title, meta, children }) {
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main">
        <article className="mx-auto max-w-prose px-4 pb-16 pt-28 sm:px-5 sm:pt-32">
          <h1 className="font-display text-[2.2rem] font-bold italic leading-[1.1] text-foreground">{title}</h1>
          <div className="mb-8 mt-3 border-b border-border-warm pb-4 text-sm text-muted-fg">{meta}</div>
          <div className="article-prose blog-prose">{children}</div>
        </article>
      </main>
      <Footer />
    </>
  );
}
