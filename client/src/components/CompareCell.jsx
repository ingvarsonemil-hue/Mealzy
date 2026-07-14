import * as React from 'react';
import { cn } from '@/lib/utils';

/* Comparison-table body cell shared by the pricing and upgrade pages.
 * `value`: true/false renders an accessible check/cross, strings render as-is.
 * `pro` highlights the Pro column. Padding can be overridden via className. */
export default function CompareCell({ value, pro, className }) {
  const cls = cn('px-3 py-3 text-center text-[15px]', pro && 'bg-green/5 font-semibold', className);
  if (value === true) {
    return (
      <td className={cls}>
        <span aria-hidden="true" className="text-green">&#10003;</span>
        <span className="sr-only">Yes</span>
      </td>
    );
  }
  if (value === false) {
    return (
      <td className={cls}>
        <span aria-hidden="true" className="text-muted-fg">&#10005;</span>
        <span className="sr-only">No</span>
      </td>
    );
  }
  return <td className={cls}>{value}</td>;
}
