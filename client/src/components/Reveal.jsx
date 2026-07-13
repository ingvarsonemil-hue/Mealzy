import * as React from 'react';
import { cn, prefersReducedMotion } from '@/lib/utils';

/* Enhance-only scroll reveal: content is visible without JS or with reduced
 * motion; otherwise fades/translates in once when it enters the viewport. */
export default function Reveal({ as: Comp = 'div', className, delay = 0, children, ...props }) {
  const ref = React.useRef(null);
  const [shown, setShown] = React.useState(() => prefersReducedMotion());

  React.useEffect(() => {
    if (shown || !('IntersectionObserver' in window)) { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { setShown(true); io.disconnect(); }
        });
      },
      { threshold: 0, rootMargin: '0px 0px 100px 0px' }
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);

  return (
    <Comp
      ref={ref}
      className={cn(
        'transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        className
      )}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      {...props}
    >
      {children}
    </Comp>
  );
}
