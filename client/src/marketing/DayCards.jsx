import * as React from 'react';

/* 3-up day preview cards — mirrors legacy .day-cards. */
export default function DayCards({ days, caption }) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {days.map((d) => (
          <div key={d.label} className="overflow-hidden rounded-md border border-border-warm bg-cream">
            <header className="bg-forest px-3.5 py-2 font-display text-[0.92rem] font-bold italic text-on-forest">
              {d.label}
            </header>
            <ul className="grid gap-1.5 px-3.5 py-3 text-[0.84rem]">
              {d.meals.map((m) => (
                <li key={m.name} className="flex items-center justify-between gap-3">
                  <span>{m.name}</span>
                  <span className="shrink-0 whitespace-nowrap text-[0.78rem] text-muted-fg">{m.kcal}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {caption && <p className="mt-3 text-center text-[0.78rem] text-muted-fg">{caption}</p>}
    </div>
  );
}
