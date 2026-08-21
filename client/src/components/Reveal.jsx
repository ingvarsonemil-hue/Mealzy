import * as React from 'react';
import { cn, prefersReducedMotion } from '@/lib/utils';

/* Enhance-only scroll reveal: content is visible without JS or with reduced
 * motion; otherwise fades/translates in once when it enters the viewport. */
export default function Reveal({ as: Comp = 'div', className, delay = 0, children, ...props }) {
  const ref = React.useRef(null);
  /* Visible by default — prerendered markup and no-JS visitors must never see
   * this content hidden. Only flipped to a hidden/animate-in state below, and
   * only for elements genuinely off-screen once JS has actually mounted. */
  const [shown, setShown] = React.useState(true);

  React.useEffect(() => {
    if (prefersReducedMotion() || !('IntersectionObserver' in window) || !ref.current) return undefined;

    const alreadyVisible = ref.current.getBoundingClientRect().top < window.innerHeight;
    if (alreadyVisible) return undefined;

    setShown(false);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { setShown(true); io.disconnect(); }
        });
      },
      { threshold: 0, rootMargin: '0px 0px 100px 0px' }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

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
