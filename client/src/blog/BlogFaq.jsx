import * as React from 'react';

/* Always-visible Q&A list at the foot of a post — mirrors legacy .faq-item. */
export default function BlogFaq({ items }) {
  return (
    <div className="my-6">
      {items.map((f) => (
        <div key={f.q} className="mb-6 border-b border-hairline pb-6 last:border-b-0">
          <div className="mb-2 font-bold">{f.q}</div>
          <div className="leading-relaxed text-muted-fg">{f.a}</div>
        </div>
      ))}
    </div>
  );
}
