import * as React from 'react';
import { Plus, Minus } from '@/components/icons';

function StatCard({ label, value, sub, children }) {
  return (
    <div className="rounded-lg border border-clr-border bg-clr-surface p-5 shadow-card">
      <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted-fg">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold italic text-green">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-fg">{sub}</div>}
      {children}
    </div>
  );
}

function ProgressBar({ pct, className }) {
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-clr-canvas">
      <div className={'h-full rounded-full transition-[width] duration-500 ' + (className || 'bg-green')} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export default function StatCards({ stats, mealsDone, waterCount, waterGoal, onAddWater, onRemoveWater, hasWeight }) {
  const note = hasWeight
    ? 'Based on National Academy of Medicine guidelines, adjusted for your body weight'
    : 'Add your weight in Settings for a personalized target';

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Today's Calories" value={stats.totalCals} sub={`of ${stats.goalCals} kcal goal`}>
        <ProgressBar pct={(stats.totalCals / stats.goalCals) * 100} />
      </StatCard>
      <StatCard label="Protein" value={`${stats.totalProtein}g`} sub={`of ${stats.goalProtein}g goal`}>
        <ProgressBar pct={(stats.totalProtein / stats.goalProtein) * 100} className="bg-brick" />
      </StatCard>
      <StatCard label="Meals Done" value={mealsDone} sub="meals completed today" />
      <StatCard label="Water" value={waterCount} sub={`of ${waterGoal} glasses (8oz each)`}>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={onRemoveWater}
            aria-label="Remove a glass"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-clr-border bg-clr-canvas text-foreground"
          >
            <Minus width="14" height="14" />
          </button>
          <button
            onClick={onAddWater}
            aria-label="Add a glass"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-green bg-green text-white"
          >
            <Plus width="14" height="14" />
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-fg">
          {note} ·{' '}
          <a href="https://nutritionsource.hsph.harvard.edu/water/" target="_blank" rel="noopener" className="text-green no-underline">
            Harvard T.H. Chan
          </a>
        </p>
      </StatCard>
    </div>
  );
}
