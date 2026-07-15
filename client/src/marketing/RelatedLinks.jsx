import * as React from 'react';

/* "Related" cross-links row at the foot of an article — mirrors legacy .related. */
export default function RelatedLinks({ links }) {
  return (
    <div className="mt-10 flex flex-wrap gap-x-7 gap-y-4 border-t border-border-warm pt-5">
      {links.map((l) => (
        <a key={l.href} href={l.href} className="text-[0.9rem] font-semibold text-green no-underline hover:underline">
          {l.label}
        </a>
      ))}
    </div>
  );
}
