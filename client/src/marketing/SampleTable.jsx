import * as React from 'react';
import { cn } from '@/lib/utils';

/* Sample meal-plan preview table — mirrors legacy .sample-table. */
export default function SampleTable({ caption, columns, rows, showTotal }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[0.88rem]">
        <caption className="caption-bottom pt-3 text-left text-xs text-muted-fg">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={cn(
                  'px-2.5 py-2 text-left text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-fg',
                  showTotal && i === columns.length - 1 && 'text-right'
                )}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap border-t border-hairline px-2.5 py-2.5 align-top font-display text-[0.95rem] font-bold italic text-green">
                {r.day}
              </td>
              {r.cells.map((c, j) => (
                <td key={j} className="border-t border-hairline px-2.5 py-2.5 align-top">
                  {c.main}
                  {c.sub && <span className="mt-0.5 block text-[0.75rem] text-muted-fg">{c.sub}</span>}
                </td>
              ))}
              {showTotal && (
                <td className="whitespace-nowrap border-t border-hairline px-2.5 py-2.5 text-right align-top font-semibold text-green">
                  {r.total}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
