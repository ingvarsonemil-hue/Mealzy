import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from '@/components/icons';

/* Inputs per the design skill: 44px min height, 16px font (blocks iOS zoom),
 * warm border, green focus ring. Labels: 12px/700 uppercase muted. */

const fieldClasses =
  'h-11 w-full rounded-md border border-border-warm bg-white px-3.5 text-base text-foreground transition-[border-color,box-shadow] duration-150 focus:border-green focus:outline-none focus:ring-[3px] focus:ring-green/10 dark:bg-cream';

export const Label = ({ className, ...props }) => (
  <label
    className={cn(
      'mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-muted-fg',
      className
    )}
    {...props}
  />
);

export const Input = React.forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldClasses, className)} {...props} />;
});

export const Select = React.forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <span className="relative block">
      <select ref={ref} className={cn(fieldClasses, 'cursor-pointer appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        width="16"
        height="16"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-fg"
      />
    </span>
  );
});
