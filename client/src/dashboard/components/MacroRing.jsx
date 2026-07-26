import * as React from 'react';

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // 251.2

/* The app pages' "one signature element" per mealzy-design.md §4: a ring
 * built from an SVG stroke-dashoffset trick (same math as the legacy
 * updateRing()), brand green stroke over a muted track, Fraunces-italic
 * number in the middle. */
export default function MacroRing({ label, value, goal, unit = 'g', strokeClassName = 'stroke-green' }) {
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const offset = CIRCUMFERENCE - pct * CIRCUMFERENCE;
  const pctLabel = goal > 0 ? Math.round((value / goal) * 100) : 0;

  return (
    <div className="px-3 py-5 text-center">
      <div className="mb-2.5 text-xs font-bold uppercase tracking-[0.07em] text-muted-fg">{label}</div>
      <svg width="100" height="100" viewBox="0 0 100 100" className="mx-auto" aria-hidden="true">
        <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--clr-border)" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="10"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          className={strokeClassName + ' transition-[stroke-dashoffset] duration-500 ease-out'}
        />
        <text x="50" y="47" textAnchor="middle" fontSize="14" fontWeight="800" className="fill-foreground font-display italic">
          {value}{unit}
        </text>
        <text x="50" y="61" textAnchor="middle" fontSize="9" className="fill-muted-fg">
          {pctLabel}%
        </text>
      </svg>
      <div className="mt-1.5 text-xs text-muted-fg">Goal: {goal}{unit}</div>
    </div>
  );
}
