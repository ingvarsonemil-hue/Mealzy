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

/* Budget-style range input: green track up to the thumb, cream-ringed thumb.
 * Shared by the hero form and the showcase budget panel so the two sliders
 * cannot drift apart visually. */
const sliderClasses =
  'h-2 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-green [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-cream [&::-moz-range-thumb]:bg-green [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-cream [&::-webkit-slider-thumb]:bg-green [&::-webkit-slider-thumb]:shadow-button';

export const RangeSlider = React.forwardRef(function RangeSlider(
  { className, min, max, value, ...props },
  ref
) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      ref={ref}
      type="range"
      min={min}
      max={max}
      value={value}
      style={{
        background: `linear-gradient(to right, var(--color-green) ${fill}%, var(--color-border) ${fill}%)`
      }}
      className={cn(sliderClasses, className)}
      {...props}
    />
  );
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
