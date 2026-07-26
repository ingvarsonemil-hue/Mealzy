import * as React from 'react';
import { btnOutline, btnSm } from '../buttonStyles';

export default function RecentPlans({ plans, onLoad }) {
  if (!plans.length) return null;

  return (
    <div className="mb-6 rounded-lg border border-hairline bg-cream p-6 shadow-card">
      <h2 className="mb-2 font-display text-lg font-bold italic text-foreground">Recent Plans</h2>
      <div className="flex flex-col">
        {plans.map((entry, i) => {
          const d = new Date(entry.generatedAt);
          const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
          const preview = (entry.meals || []).slice(0, 2).map((m) => m.name || m.type).filter(Boolean).join(', ');
          return (
            <div
              key={i}
              className={'flex items-center justify-between gap-4 py-3' + (i < plans.length - 1 ? ' border-b border-hairline' : '')}
            >
              <div>
                <div className="text-sm font-semibold text-foreground">{label}</div>
                {preview && <div className="mt-0.5 text-sm text-muted-fg">{preview}…</div>}
              </div>
              <button onClick={() => onLoad(i)} className={btnOutline + ' ' + btnSm + ' whitespace-nowrap'}>Load plan</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
