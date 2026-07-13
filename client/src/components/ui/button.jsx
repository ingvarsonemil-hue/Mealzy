import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-body text-[15px] font-semibold leading-tight no-underline transition-[background-color,box-shadow,color] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-green text-white shadow-button hover:bg-green-deep',
        quiet: 'bg-transparent text-current hover:bg-forest-raise',
        veil: 'border border-forest-line bg-forest-raise text-on-forest-strong hover:bg-white/15'
      },
      size: {
        sm: 'min-h-[40px] px-4 py-2',
        md: 'min-h-[44px] min-w-[100px] px-6 py-3',
        lg: 'min-h-[52px] px-8 py-3.5 text-base'
      },
      full: {
        true: 'w-full'
      }
    },
    defaultVariants: { variant: 'primary', size: 'md' }
  }
);

/* Polymorphic: renders an <a> when href is given, otherwise a <button>. */
const Button = React.forwardRef(function Button(
  { className, variant, size, full, href, type, ...props },
  ref
) {
  const Comp = href ? 'a' : 'button';
  return (
    <Comp
      ref={ref}
      href={href}
      type={href ? undefined : type || 'button'}
      className={cn(buttonVariants({ variant, size, full }), className)}
      {...props}
    />
  );
});

export { Button, buttonVariants };
