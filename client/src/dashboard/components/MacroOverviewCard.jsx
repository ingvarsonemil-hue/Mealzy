import * as React from 'react';
import MacroRing from './MacroRing';

export default function MacroOverviewCard({ hasMeals, stats, dateStr }) {
  return (
    <div className="mb-6 rounded-lg border border-hairline bg-cream p-6 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold italic text-foreground">Macro Overview</h2>
        <span className="text-sm text-muted-fg">{hasMeals ? dateStr : 'Today'}</span>
      </div>

      {!hasMeals ? (
        <p className="py-5 text-center text-sm text-muted-fg">Generate today's plan to see your macros.</p>
      ) : (
        <div className="grid grid-cols-3 divide-x divide-hairline">
          <MacroRing label="Protein" value={stats.totalProtein} goal={stats.goalProtein} strokeClassName="stroke-[#f59e0b]" />
          <MacroRing label="Carbs" value={stats.totalCarbs} goal={stats.goalCarbs} strokeClassName="stroke-[#3b82f6]" />
          <MacroRing label="Fat" value={stats.totalFat} goal={stats.goalFat} strokeClassName="stroke-brick" />
        </div>
      )}
    </div>
  );
}
