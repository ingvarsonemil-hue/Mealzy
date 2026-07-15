import * as React from 'react';

/* Green CTA box closing out blog posts — mirrors legacy .cta-box. */
export default function BlogCta({ lead, body, ctaLabel = 'Try Mealzy Free', ctaHref = 'https://mealzy.org' }) {
  return (
    <div className="my-12 rounded-lg bg-green px-8 py-8 text-center text-white">
      <p className="text-lg font-bold">{lead}</p>
      <p className="mt-2 text-lg">{body}</p>
      <a
        href={ctaHref}
        className="mt-4 inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md bg-white px-6 py-3 font-semibold text-green no-underline transition-colors duration-200 hover:bg-white/90"
      >
        {ctaLabel}
      </a>
    </div>
  );
}
