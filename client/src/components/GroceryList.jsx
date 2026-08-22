import * as React from 'react';
import Reveal from '@/components/Reveal';
import { Button } from '@/components/ui/button';
import { Phone, Check } from '@/components/icons';
import { track } from '@/lib/api';
import { cn } from '@/lib/utils';
import { range, dollars, singleEstimate, estimateDollars } from '@/components/showcase-plan';

/* The shoppable half of the Showcase result: the priced list the week produces, its
 * tick state, and the clipboard copy. Split out of Showcase.jsx when the three-
 * column rewrite pushed that file past the 500-line limit; the seam is a real
 * one — nothing here reads the day cards, and nothing there reads these rows.
 * The plan is passed in so both halves stay driven by the same budget. */

/* One shoppable line, on three fixed tracks: [checkbox + name] | [quantity] |
 * [est. price]. The tracks are sized rather than auto so the quantity and price
 * columns line up down the whole group — a run-on "Cherry tomatoes 400 g $3–$4"
 * cannot be scanned, three aligned columns can. The name track is the only
 * flexible one and may wrap; the previous version pinned every part with
 * shrink-0, which pushed the price outside the card as soon as a name ran long.
 *
 * gap-x-5 between the tracks, and the quantity and price tracks are sized for
 * their widest real content anywhere on the slider — "20 tbsp" and "13 tins" at
 * the top of the range, "$0.95–$1.20" at the bottom, where sub-dollar lines are
 * quoted in cents so nothing reads as free. Both are sized for those rather than
 * for the $60 default; the gutter is what stops a long name and its quantity
 * reading as one concatenated string.
 *
 * The whole row is the label, so the tap target is the line rather than the
 * 16px box — this list is meant to be used one-handed in an aisle. Ticking is
 * presentation only; nothing is persisted from a sample. */
function GroceryLine({ item, qty, cents, checked, onToggle }) {
  const struck = checked && 'text-muted-fg line-through';
  return (
    <li>
      <label className="grid cursor-pointer grid-cols-[minmax(0,1fr)_4.25rem_6.25rem] items-center gap-x-5 border-b border-hairline py-3 text-[15px] leading-snug last:border-b-0">
        <span className="flex min-w-0 items-center gap-2.5">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="h-4 w-4 shrink-0 cursor-pointer accent-green"
          />
          <span className={cn('min-w-0', struck)}>{item}</span>
        </span>
        <span className={cn('text-right tabular-nums text-muted-fg', struck)}>{qty}</span>
       <span className={cn('text-right font-medium tabular-nums', struck)}>{singleEstimate(range(cents))}</span>
      </label>
    </li>
  );
}

/* An aisle and its lines. Fresh aisles and the pantry render identically, so
 * they share this rather than repeating the markup twice. `limit` truncates
 * the collapsed preview; omit it (or pass Infinity) to show every line. */
function GroceryGroup({ title, muted, items, limit = Infinity, prefix, ticked, onToggle, children }) {
  const shown = items.slice(0, limit);
  return (
    <div className="min-w-0">
      <p
        className={cn(
          'mb-1 mt-5 text-xs font-bold uppercase tracking-[0.08em]',
          muted ? 'text-muted-fg' : 'text-green-deep dark:text-green-light'
        )}
      >
        {title}
      </p>
      <ul role="list">
        {shown.map(([item, qty, cents]) => (
          <GroceryLine
            key={item}
            item={item}
            qty={qty}
            cents={cents}
            checked={ticked.has(`${prefix}:${item}`)}
            onToggle={() => onToggle(`${prefix}:${item}`)}
          />
        ))}
      </ul>
      {children}
    </div>
  );
}

/* The list as plain text, in the order it is rendered, for the clipboard. */
function groceryText(plan) {
  const line = ([item, qty, cents]) => `- ${item} (${qty}) — Est. ${singleEstimate(range(cents))}`;
  const blocks = plan.fresh.map(([aisle, items]) => [aisle, ...items.map(line)].join('\n'));

  blocks.push(['Pantry staples', ...plan.pantry.map(line)].join('\n'));

  return [
    `Mealzy grocery list — ${dollars(plan.budget * 100)} week`,
    ...blocks,
    `Week total: Est. ${singleEstimate(range(plan.spend))}`
  ].join('\n\n');
}

/* Copies the list and says so. The confirmation is the button's own label, so
 * the answer to "did that work?" is where the click happened. */
function CopyListButton({ plan }) {
  const [state, setState] = React.useState('idle');

  /* Cleared on a timer, so the timer has to die with the component and with
   * any click that lands before the previous one has faded. */
  React.useEffect(() => {
    if (state === 'idle') return undefined;
    const t = setTimeout(() => setState('idle'), 2400);
    return () => clearTimeout(t);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(groceryText(plan));
      setState('copied');
    } catch {
      /* Clipboard access is refused on insecure origins and by some browser
       * privacy settings. Say that plainly — there is no keystroke that would
       * work instead here, since nothing on the page is selected. */
      setState('error');
    }
  };

  const label = {
    idle: 'Copy grocery list',
    copied: 'Copied to clipboard',
    error: 'Copy blocked by your browser'
  }[state];

  return (
    <>
      <Button
        variant="quiet"
        size="sm"
        onClick={copy}
        className="border border-border-warm bg-cream hover:bg-muted-bg"
      >
        {state === 'copied' && <Check className="text-green" aria-hidden="true" />}
        {label}
      </Button>
      {/* The label change is announced separately: a button's own name changing
        * is not reliably read out by screen readers. */}
      <span aria-live="polite" className="sr-only">
        {state === 'idle' ? '' : label}
      </span>
    </>
  );
}

/* Collapsed default: the first two lines of each fresh aisle (Produce,
 * Protein — 4 items) plus the first two pantry lines (2 items) = 6, enough to
 * prove the shape of the list — categories, quantities, prices — without the
 * homepage reading as a spreadsheet. Expanding reveals every line. */
const COLLAPSED_FRESH_LIMIT = 2;
const COLLAPSED_PANTRY_LIMIT = 2;

export default function GroceryList({ plan, ctaHref = 'login.html?signup=1' }) {
  const [ticked, setTicked] = React.useState(() => new Set());
  const [expanded, setExpanded] = React.useState(false);

  const toggle = (id) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) track('homepage_demo_grocery_expanded', {});
  };

  /* Only pantry items reduce the total — they're the ones a shopper might
   * already have. Ticking a fresh-aisle item just tracks progress in the
   * aisle, it isn't a claim that item is free. */
  const pantryDeduction = plan.pantry.reduce((sum, [item, , cents]) => {
    if (!ticked.has(`pantry:${item}`)) return sum;
    return sum + estimateDollars(cents);
  }, 0);
  const weekTotal = Math.max(0, estimateDollars(plan.spend) - pantryDeduction);

  const hiddenCount = expanded
    ? 0
    : plan.fresh.reduce((n, [, items]) => n + Math.max(0, items.length - COLLAPSED_FRESH_LIMIT), 0)
      + Math.max(0, plan.pantry.length - COLLAPSED_PANTRY_LIMIT);

  /* Against the full, untouched estimate — not the ticked-down weekTotal
   * below — so this figure doesn't drift as the visitor ticks pantry items
   * they already own. It's a statement about the example plan, not about
   * what's left in their cart right now. */
  const savedUnderBudget = Math.max(0, plan.budget - estimateDollars(plan.spend));

  return (
    <Reveal delay={100} className="mt-8 min-w-0 rounded-lg border border-border-warm bg-cream p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-2xl font-bold leading-[1.15] tracking-[-0.01em]">The grocery list</h3>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-green/40 bg-green/10 px-3 py-1 text-[13px] font-semibold text-green-deep dark:text-green-light">
          <Phone />
          Works on your phone
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] leading-[1.6] text-muted-fg">
          One list for the whole week above, sized to your budget — not seven separate recipes to
          reconcile yourself. Tick items off as you shop; opens in any browser, nothing to install.
        </p>
        <CopyListButton plan={plan} />
      </div>

      <div className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
        {plan.fresh.map(([aisle, items]) => (
          <GroceryGroup
            key={aisle}
            title={aisle}
            items={items}
            limit={expanded ? Infinity : COLLAPSED_FRESH_LIMIT}
            prefix={aisle}
            ticked={ticked}
            onToggle={toggle}
          />
        ))}

        {/* Kept apart from the shop-this-week aisles: these are cupboard
          * items the plan draws on, priced at the share it uses rather
          * than as a full pack you have to buy again. */}
        <GroceryGroup
          title="Pantry staples"
          muted
          items={plan.pantry}
          limit={expanded ? Infinity : COLLAPSED_PANTRY_LIMIT}
          prefix="pantry"
          ticked={ticked}
          onToggle={toggle}
        >
          <p className="mt-2 text-[13px] leading-[1.5] text-muted-fg">
            Priced at what the week uses, not a full pack — most of these are already in your
            cupboard. Tick off what you've already got to see your real total.
          </p>
        </GroceryGroup>
      </div>

      {hiddenCount > 0 && (
        <div className="mt-2 text-center">
          <Button
            variant="quiet"
            size="sm"
            onClick={toggleExpanded}
            className="border border-border-warm bg-cream hover:bg-muted-bg"
          >
            + {hiddenCount} more items
          </Button>
        </div>
      )}
      {expanded && (
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={toggleExpanded}
            className="inline-flex min-h-[44px] cursor-pointer items-center justify-center px-2 text-sm text-muted-fg underline underline-offset-2 hover:text-foreground"
          >
            Show fewer ingredients
          </button>
        </div>
      )}

      <div className="mt-5 border-t border-border-warm pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-bold">Estimated grocery total</span>
          <span className="text-xl font-bold tabular-nums text-green-deep dark:text-green-light">
            ${weekTotal.toFixed(0)}
          </span>
        </div>
        {pantryDeduction > 0 && (
          <p className="mt-1 text-right text-xs font-medium text-muted-fg">
            (−${pantryDeduction.toFixed(0)} already in your pantry)
          </p>
        )}
        {savedUnderBudget > 0 && (
          <p className="mt-1 text-[13px] text-muted-fg">
            ${savedUnderBudget.toFixed(0)} under your ${plan.budget} example budget.
          </p>
        )}
      </div>

      {/* A lightweight secondary nudge, not another large CTA card — the
       * dominant "Build my real week" already sits above the static example,
       * right after the visitor's own answers. */}
      <div className="mt-5 text-center">
        <a
          href={ctaHref}
          onClick={() => track('homepage_demo_cta_clicked', {})}
          className="inline-flex min-h-[44px] items-center justify-center px-2 text-[15px] font-semibold text-green-deep underline underline-offset-2 hover:text-forest dark:text-green-light"
        >
          Build my real week →
        </a>
      </div>
      <p className="mt-3 text-center text-[13px] text-muted-fg">
        Prices are estimates based on typical supermarket rates.
      </p>
    </Reveal>
  );
}
