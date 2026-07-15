import * as React from 'react';

/* One day's breakfast/lunch/dinner breakdown — mirrors legacy .meal-day. */
export default function MealDayCard({ day, meals, total }) {
  return (
    <div className="my-4 rounded-lg border border-border-warm bg-parchment p-4">
      <strong className="mb-2 block">{day}</strong>
      {meals.map((m) => (
        <div key={m.label} className="my-2 text-[0.95rem]">
          {m.label}: {m.text}
        </div>
      ))}
      <div className="mt-3 font-bold text-green-deep dark:text-green-light">{total}</div>
    </div>
  );
}
