import * as React from 'react';
import { Flame, Zap, Wheat, Droplet, ClockIcon, ChevronRight } from '@/components/icons';
import { cn } from '@/lib/utils';

/* Collapsible ingredients/instructions section — mirrors the legacy
 * max-height transition (toggleSection in public/meal-planner.html) rather
 * than an instant show/hide, so the card doesn't jump. */
function Expandable({ open, children }) {
  const ref = React.useRef(null);
  const [maxHeight, setMaxHeight] = React.useState('0px');

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setMaxHeight(open ? el.scrollHeight + 'px' : '0px');
  }, [open, children]);

  return (
    <div style={{ maxHeight, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
      <div ref={ref}>{children}</div>
    </div>
  );
}

function ExpandButton({ open, onClick, className, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 py-1 font-body text-[0.82rem] font-semibold text-green', className)}
    >
      <ChevronRight className={cn('transition-transform duration-200', open && 'rotate-90')} />
      {children}
    </button>
  );
}

export default function MealCard({ meal, index, swapping, flash, onToggleDone, onSwap }) {
  const [ingredientsOpen, setIngredientsOpen] = React.useState(false);
  const [instructionsOpen, setInstructionsOpen] = React.useState(false);

  const typeLabel = meal.type ? meal.type.charAt(0).toUpperCase() + meal.type.slice(1) : 'Meal';
  const ingredients = meal.ingredients || [];
  const instructions = meal.instructions || [];

  return (
    <div
      className={cn(
        'rounded-lg border border-hairline bg-cream p-[1.1rem_1.25rem] shadow-card transition-shadow duration-200 hover:border-green',
        meal.completed && 'opacity-55',
        flash && 'outline outline-2 outline-offset-2 outline-green'
      )}
    >
      <div className="mb-[0.45rem] flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full bg-green/15 px-[0.65rem] py-[0.2rem] text-xs font-semibold text-green">
          {typeLabel}
        </span>
        <div className="flex flex-wrap items-center gap-4 text-[0.8rem] font-semibold text-muted-fg">
          <span className="flex items-center gap-1">
            <Flame /> {meal.calories} kcal
          </span>
          <span className="flex items-center gap-1">
            <Zap /> {meal.protein}g protein
          </span>
          {meal.cookTime ? (
            <span className="flex items-center gap-1">
              <ClockIcon /> {meal.cookTime} min
            </span>
          ) : null}
        </div>
      </div>

      <div className={cn('mb-1 font-display text-[1.1rem] font-bold italic leading-tight tracking-[-0.025em]', meal.completed && 'line-through')}>
        {meal.name}
      </div>
      {meal.description ? <p className="mb-3 text-[0.85rem] leading-relaxed text-muted-fg">{meal.description}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-[0.4rem] text-[0.82rem] text-muted-fg">
          <input
            type="checkbox"
            checked={!!meal.completed}
            onChange={(e) => onToggleDone(index, e.target.checked)}
            aria-label={`Mark ${meal.name} as done`}
            className="h-4 w-4 cursor-pointer accent-green"
          />
          Mark done
        </label>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[0.8rem] font-semibold text-muted-fg">
            <Wheat /> {meal.carbs}g&nbsp;
            <Droplet /> {meal.fat}g
          </span>
          <button
            type="button"
            disabled={swapping}
            onClick={() => onSwap(index, meal.type)}
            className="min-h-[32px] cursor-pointer rounded-md border border-clr-border bg-clr-surface px-[0.65rem] py-1 text-[0.78rem] font-medium text-foreground transition-colors hover:border-green hover:text-green disabled:cursor-not-allowed disabled:opacity-60"
          >
            {swapping ? 'Swapping…' : 'Swap'}
          </button>
        </div>
      </div>

      <div className="mt-3 border-t border-hairline pt-[0.6rem]">
        <ExpandButton open={ingredientsOpen} onClick={() => setIngredientsOpen((v) => !v)}>
          Ingredients ({ingredients.length})
        </ExpandButton>
        <Expandable open={ingredientsOpen}>
          <ul className="mt-3 flex flex-col gap-[0.3rem]">
            {ingredients.map((ing, i) => (
              <li key={i} className="flex justify-between border-b border-hairline py-[0.3rem] text-[0.85rem]">
                <span>{ing.name}</span>
                <span className="text-muted-fg">
                  {ing.amount}
                  {ing.cost ? ` · $${ing.cost.toFixed(2)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Expandable>

        <ExpandButton open={instructionsOpen} onClick={() => setInstructionsOpen((v) => !v)} className="mt-[0.35rem]">
          Instructions ({instructions.length} steps)
        </ExpandButton>
        <Expandable open={instructionsOpen}>
          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5">
            {instructions.map((step, i) => (
              <li key={i} className="text-[0.85rem] text-muted-fg">{step}</li>
            ))}
          </ol>
        </Expandable>
      </div>
    </div>
  );
}
