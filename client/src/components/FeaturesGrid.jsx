import * as React from 'react';
import Reveal from '@/components/Reveal';
import { cn, prefersReducedMotion } from '@/lib/utils';

/* Typographic treatment — no icon circles. Oversized Fraunces numerals carry
 * the visual interest; sizes come from the mealzy-design type scale. */
const FEATURES = [
  {
    label: 'Plan',
    title: 'AI meal planning',
    body: 'Tell it your calories, your budget, and what you like. It builds the whole week — practical, home-cooked meals using ingredients from any regular supermarket.'
  },
  {
    label: 'Shop',
    title: 'Automatic grocery list',
    body: "Every ingredient from your week's plan, organised by category, with estimated costs. You only buy what you need. Nothing goes to waste."
  },
  {
    label: 'Spend',
    title: 'A budget that holds',
    body: "Set your weekly grocery budget once. Mealzy builds every plan around it. The number doesn't move unless you change it."
  },
  {
    label: 'Ask',
    title: 'AI nutrition coach',
    body: "Ask Mia — your AI nutritionist — anything. Recipe ideas, macro questions, what to cook with what's in your fridge. Available any time."
  },
  {
    label: 'Track',
    title: 'Calorie and macro tracking',
    body: 'Every meal is already calculated. Log what you eat, see your weekly trends, and watch how your nutrition stacks up against your targets.'
  },
  {
    label: 'Speak',
    title: '11 languages',
    body: 'English, Swedish, Norwegian, Danish, German, French, Spanish, Italian, Portuguese, Dutch, Japanese. The whole app works in your language.'
  }
];

/* Scroll-triggered staggered fade-in: opacity 0 / translateY(24px) -> visible,
 * 500ms ease, 150ms stagger, IntersectionObserver threshold 0.1, fires once.
 * Skipped entirely under prefers-reduced-motion. */
function useStaggerReveal() {
  const gridRef = React.useRef(null);
  const [shown, setShown] = React.useState(() => prefersReducedMotion());

  React.useEffect(() => {
    if (shown || !('IntersectionObserver' in window)) { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { setShown(true); io.disconnect(); }
        });
      },
      { threshold: 0.1 }
    );
    if (gridRef.current) io.observe(gridRef.current);
    return () => io.disconnect();
  }, [shown]);

  return [gridRef, shown];
}

export default function FeaturesGrid() {
  const [gridRef, shown] = useStaggerReveal();
  const reduced = prefersReducedMotion();

  return (
    <section aria-labelledby="included-heading" className="bg-parchment py-16 sm:py-20">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        <Reveal className="mx-auto mb-12 max-w-prose text-center">
          <h2
            id="included-heading"
            className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]"
          >
            Everything in one place. Nothing you don't need.
          </h2>
        </Reveal>

        <div ref={gridRef} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            /* Outer div owns the entrance animation; inner article owns hover,
             * so the stagger delay never slows down hover feedback. */
            <div
              key={f.title}
              className={cn(
                !reduced && 'transition-[opacity,transform] duration-500 ease-out',
                !reduced && (shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0')
              )}
              style={!reduced ? { transitionDelay: `${i * 150}ms` } : undefined}
            >
            <article
              className="relative h-full overflow-hidden rounded-lg border border-border-warm bg-cream p-6 shadow-card transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-2 -top-6 select-none font-display text-[96px] font-black italic leading-none text-forest/[0.09] dark:text-green-light/15"
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-green-deep dark:text-green-light">{f.label}</p>
              <h3 className="relative mt-3 font-display text-2xl font-bold leading-[1.15] tracking-[-0.01em]">
                {f.title}
              </h3>
              <p className="relative mt-3 text-[15px] leading-[1.6] text-muted-fg">{f.body}</p>
            </article>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
