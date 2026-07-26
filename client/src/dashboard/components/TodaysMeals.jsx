import * as React from 'react';
import { Flame, Zap, ClockIcon, ThumbUp, ThumbDown, CalendarIcon, Refresh } from '@/components/icons';
import { btnOutline, btnPrimary, btnSm } from '../buttonStyles';
import { cn } from '@/lib/utils';

const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];
const TYPE_STYLES = {
  breakfast: 'bg-[#f59e0b]/15 text-[#92620a] dark:text-[#f5b95d]',
  lunch: 'bg-green/15 text-green-deep dark:text-green-light',
  snack: 'bg-brick/10 text-brick',
  dinner: 'bg-forest/10 text-forest dark:bg-forest/30 dark:text-on-forest-body'
};

function RateButton({ Icon, active, activeClass, onClick, label }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-md border px-2.5 transition-colors duration-150',
        active ? activeClass : 'border-clr-border bg-clr-canvas text-muted-fg hover:text-foreground'
      )}
    >
      <Icon />
    </button>
  );
}

function MealCard({ meal, index, onToggleDone, onOpenRecipe, onSwap, onRate, rating, swapping }) {
  const typeLabel = meal.type.charAt(0).toUpperCase() + meal.type.slice(1);
  return (
    <div
      className={cn(
        'relative rounded-lg border border-clr-border bg-clr-surface p-5 transition-shadow duration-200 hover:shadow-md',
        meal.completed && 'opacity-55'
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-[0.05em]', TYPE_STYLES[meal.type])}>
          {typeLabel}
        </span>
        <div className="flex items-center gap-3 text-xs font-semibold text-muted-fg">
          <span className="flex items-center gap-1"><Flame /> {meal.calories} kcal</span>
          <span className="flex items-center gap-1"><Zap /> {meal.protein}g protein</span>
          {meal.cookTime ? <span className="flex items-center gap-1"><ClockIcon /> {meal.cookTime} min</span> : null}
        </div>
      </div>
      <div className={cn('mb-1 font-display text-lg font-bold italic leading-tight text-foreground', meal.completed && 'line-through')}>
        {meal.name}
      </div>
      <p className="mb-3 text-sm leading-relaxed text-muted-fg">{meal.description || ''}</p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-fg">
          <input
            type="checkbox"
            checked={!!meal.completed}
            onChange={(e) => onToggleDone(index, e.target.checked)}
            aria-label={`Mark ${meal.name} as done`}
            className="h-4 w-4 cursor-pointer accent-green"
          />
          Mark as done
        </label>
        <div className="flex gap-1.5">
          <button onClick={() => onOpenRecipe(index)} className={btnOutline + ' ' + btnSm}>Recipe</button>
          <button onClick={() => onSwap(index)} disabled={swapping} aria-label="Swap meal" className={btnOutline + ' ' + btnSm}>
            {swapping ? <><Refresh className="animate-spin" /> Swapping</> : 'Swap'}
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-hairline pt-3">
        <span className="text-xs text-muted-fg">Rate:</span>
        <RateButton
          Icon={ThumbUp}
          active={rating === 1}
          activeClass="border-green/40 bg-green/10 text-green"
          onClick={() => onRate(index, 1)}
          label="Like this meal"
        />
        <RateButton
          Icon={ThumbDown}
          active={rating === -1}
          activeClass="border-error/40 bg-error/10 text-error"
          onClick={() => onRate(index, -1)}
          label="Dislike this meal"
        />
        {rating === 1 && <span className="text-xs text-green">More like this</span>}
        {rating === -1 && <span className="text-xs text-error">Will be avoided</span>}
      </div>
    </div>
  );
}

export default function TodaysMeals({
  meals, ratings, dayComplete, swappingIndex,
  onToggleDone, onOpenRecipe, onSwap, onRate, onMarkDayComplete, onGenerate
}) {
  const sorted = [...meals].sort((a, b) => MEAL_ORDER.indexOf(a.type) - MEAL_ORDER.indexOf(b.type));

  return (
    <div className="mb-6 rounded-lg border border-hairline bg-cream p-6 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-display text-lg font-bold italic text-foreground">Today's Meals</h2>
        <a href="/meal-planner.html" className={btnOutline + ' ' + btnSm}>View Planner →</a>
      </div>

      {sorted.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green/10 text-green">
            <CalendarIcon width="28" height="28" />
          </div>
          <h3 className="mb-2 font-display text-lg font-bold italic text-foreground">No plan for today</h3>
          <p className="mx-auto mb-5 max-w-[300px] text-sm text-muted-fg">
            Generate a meal plan to see your meals, macros, and grocery list here.
          </p>
          <button onClick={onGenerate} className={btnPrimary}>Generate a plan</button>
        </div>
      ) : (
        <>
          <div role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {sorted.map((meal) => {
              const index = meals.indexOf(meal);
              return (
                <MealCard
                  key={index}
                  meal={meal}
                  index={index}
                  rating={ratings[meal.name] || 0}
                  swapping={swappingIndex === index}
                  onToggleDone={onToggleDone}
                  onOpenRecipe={onOpenRecipe}
                  onSwap={onSwap}
                  onRate={onRate}
                />
              );
            })}
          </div>
          {!dayComplete && (
            <div className="mt-4 text-center">
              <button onClick={onMarkDayComplete} className={btnOutline}>Mark day complete</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
