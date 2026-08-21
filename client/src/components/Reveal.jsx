import * as React from 'react';
import { cn } from '@/lib/utils';

/* Content-first: children render visible immediately, every time, with no
 * state that JS or a scroll event has to reach in order to show them.
 *
 * The previous version started elements at opacity-0 and only revealed them
 * once an IntersectionObserver reported the element intersecting the live
 * browser viewport. That observer only fires on a real scroll/resize of the
 * viewport — a full-page capture that clips or resizes to the document's
 * full height without dispatching an actual scroll (headless full-page
 * screenshots, prerenderers, crawlers) never triggers it. The section
 * wrapper still reports its full layout height (opacity/transform don't
 * affect box size), so the result was reserved height with invisible
 * content — exactly what production screenshots were showing below the
 * fold. Animation is not worth that risk; kept as a static wrapper so call
 * sites (delay prop included) don't need to change. */
export default function Reveal({ as: Comp = 'div', className, delay, children, ...props }) {
  void delay;
  return (
    <Comp className={cn(className)} {...props}>
      {children}
    </Comp>
  );
}
