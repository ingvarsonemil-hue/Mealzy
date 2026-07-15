import * as React from 'react';

/* Protein source price/gram rows — mirrors legacy .protein-list. */
export default function ProteinList({ items }) {
  return (
    <ul className="my-4 list-none pl-0">
      {items.map((it) => (
        <li key={it.name} className="flex items-center justify-between border-b border-hairline py-2 text-[0.95rem] last:border-b-0">
          <strong>{it.name}</strong>
          <span className="text-muted-fg">{it.meta}</span>
        </li>
      ))}
    </ul>
  );
}
