import * as React from 'react';

/* Grocery list grouped by store section — mirrors legacy .grocery-category. */
export default function GroceryCategory({ heading, items }) {
  return (
    <div className="my-6">
      <h4 className="mb-2 mt-4 text-[0.95rem] font-bold uppercase tracking-wide text-green-deep dark:text-green-light">{heading}</h4>
      <ul className="list-none pl-0">
        {items.map((it) => (
          <li key={it} className="relative py-1 pl-5 text-[0.95rem] before:absolute before:left-0 before:content-['•']">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
