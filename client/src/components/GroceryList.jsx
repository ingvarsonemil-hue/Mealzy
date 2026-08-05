import * as React from 'react';
import Reveal from '@/components/Reveal';
import { Button } from '@/components/ui/button';
import { Phone, Check } from '@/components/icons';
import { cn } from '@/lib/utils';
import { range, dollars } from '@/components/showcase-plan';

/* The shoppable half of the Showcase: the priced list the week produces, its
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
 * gap-x-4 between the tracks, and the quantity and price tracks are sized for
 * their widest real content ("3 tins", "$10–$12" at the top of the budget
 * range) rather than for the $60 default — the gutter is what stops a long
 * name and its quantity reading as one concatenated string.
 *
 * The whole row is the label, so the tap target is the line rather than the
 * 16px box — this list is meant to be used one-handed in an aisle. Ticking is
 * presentation only; nothing is persisted from a sample. */
function GroceryLine({ item, qty, cents, checked, onToggle }) {
  const struck = checked && 'text-muted-fg line-through';
  return (
    <li>
      <label className="grid cursor-pointer grid-cols-[minmax(0,1fr)_3.5rem_5rem] items-center gap-x-4 border-b border-hairline py-3 text-[15px] leading-snug last:border-b-0">
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
        <span className={cn('text-right font-medium tabular-nums', struck)}>{range(cents)}</span>
      </label>
    </li>
  );
}

/* An aisle and its lines. Fresh aisles and the pantry render identically, so
 * they share this rather than repeating the markup twice. */
function GroceryGroup({ title, muted, items, prefix, ticked, onToggle, children }) {
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
        {items.map(([item, qty, cents]) => (
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
  const line = ([item, qty, cents]) => `- ${item} (${qty}) — Est. ${range(cents)}`;
  const blocks = plan.fresh.map(([aisle, items]) => [aisle, ...items.map(line)].join('\n'));

  blocks.push(['Pantry staples', ...plan.pantry.map(line)].join('\n'));

  return [
    `Mealzy grocery list — ${dollars(plan.budget * 100)} week`,
    ...blocks,
    `Week total: Est. ${range(plan.spend)}`
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

export default function GroceryList({ plan }) {
  const [ticked, setTicked] = React.useState(() => new Set());

  const toggle = (id) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

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
          Tick items off as you shop — the list opens in any browser, nothing to install.
        </p>
        <CopyListButton plan={plan} />
      </div>

      <div className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
        {plan.fresh.map(([aisle, items]) => (
          <GroceryGroup
            key={aisle}
            title={aisle}
            items={items}
            prefix={aisle}
            ticked={ticked}
            onToggle={toggle}
          />
        ))}

        {/* Kept apart from the shop-this-week aisles: these are cupboard
          * items the plan draws on, priced at the share it uses rather
          * than as a full pack you have to buy again. */}
        <GroceryGroup title="Pantry staples" muted items={plan.pantry} prefix="pantry" ticked={ticked} onToggle={toggle}>
          <p className="mt-2 text-[13px] leading-[1.5] text-muted-fg">
            Priced at what the week uses, not a full pack — most of these are already in your
            cupboard.
          </p>
        </GroceryGroup>
      </div>

      <div className="mt-5 flex items-baseline justify-between border-t border-border-warm pt-4 text-base font-bold">
        <span>Week total</span>
        <span className="tabular-nums">Est. {range(plan.spend)}</span>
      </div>
    </Reveal>
  );
}
