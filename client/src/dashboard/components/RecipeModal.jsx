import * as React from 'react';
import Modal from './Modal';
import { Flame, Zap, Wheat, Droplet, ClockIcon } from '@/components/icons';
import { getCurrencySymbol } from '@/lib/currency';

function Pill({ children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-clr-canvas px-2.5 py-1 text-xs font-semibold text-foreground">
      {children}
    </span>
  );
}

export default function RecipeModal({ meal, currency, onClose }) {
  if (!meal) return null;
  const ingredients = meal.ingredients || [];
  const instructions = meal.instructions || [];
  const symbol = getCurrencySymbol(currency);

  return (
    <Modal open={!!meal} onClose={onClose} maxWidth="560px" showClose labelledBy="recipe-modal-title">
      <h2 id="recipe-modal-title" className="pr-8 font-display text-xl font-bold italic text-foreground">{meal.name}</h2>
      {meal.description && <div className="mt-1 text-sm text-muted-fg">{meal.description}</div>}

      <div className="my-4 flex flex-wrap gap-2">
        <Pill><Flame /> {meal.calories} kcal</Pill>
        <Pill><Zap /> {meal.protein}g protein</Pill>
        <Pill><Wheat /> {meal.carbs}g carbs</Pill>
        <Pill><Droplet /> {meal.fat}g fat</Pill>
        {meal.cookTime ? <Pill><ClockIcon /> {meal.cookTime} min</Pill> : null}
      </div>

      <div className="mb-5">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-muted-fg">Ingredients</h3>
        <ul className="flex flex-col gap-1.5">
          {ingredients.map((ing, i) => (
            <li key={i} className="flex items-center justify-between border-b border-hairline pb-1.5 text-sm">
              <span>{ing.name}</span>
              <span className="text-muted-fg">
                {ing.amount}{ing.cost ? ` · ${symbol}${ing.cost.toFixed(2)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-muted-fg">Instructions</h3>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed">
          {instructions.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
      </div>
    </Modal>
  );
}
