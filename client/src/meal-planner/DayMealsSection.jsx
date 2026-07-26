import * as React from 'react';
import MealCard from './MealCard';
import { CalendarIcon, Star, AlertCircle } from '@/components/icons';
import { Button } from '@/components/ui/button';

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-hairline bg-cream p-[1.1rem_1.25rem]">
      <div className="mb-3 h-5 w-[72px] animate-pulse rounded bg-clr-border" />
      <div className="mb-2 h-[22px] w-[65%] animate-pulse rounded bg-clr-border" />
      <div className="mb-1 h-3.5 w-[90%] animate-pulse rounded bg-clr-border" />
      <div className="mb-3 h-3.5 w-[70%] animate-pulse rounded bg-clr-border" />
      <div className="mb-3 flex gap-4">
        <div className="h-3.5 w-20 animate-pulse rounded bg-clr-border" />
        <div className="h-3.5 w-20 animate-pulse rounded bg-clr-border" />
        <div className="h-3.5 w-20 animate-pulse rounded bg-clr-border" />
      </div>
    </div>
  );
}

export default function DayMealsSection({ meals, generating, error, swappingIndex, flashIndex, onGenerate, onToggleDone, onSwap }) {
  if (generating) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[hsl(0,60%,88%)] bg-[hsl(0,60%,98%)] p-[3rem_1.5rem] text-center dark:border-[hsl(0,40%,25%)] dark:bg-[hsl(0,30%,10%)]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(0,60%,92%)] text-[hsl(0,65%,45%)] dark:bg-[hsl(0,30%,18%)]">
          <AlertCircle />
        </div>
        <h3 className="mb-[0.4rem] font-display text-[1.15rem] font-bold italic text-foreground">Something went wrong</h3>
        <p className="mb-5 text-[0.88rem] text-muted-fg">{error}</p>
        <Button onClick={onGenerate}>Try again</Button>
      </div>
    );
  }

  if (!meals || meals.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-cream p-[3.5rem_1.5rem] text-center shadow-card">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green/10 text-green">
          <CalendarIcon />
        </div>
        <h3 className="mb-[0.4rem] font-display text-xl font-bold italic text-foreground">No meals planned for this day</h3>
        <p className="mb-6 text-[0.88rem] text-muted-fg">Generate an AI meal plan or navigate to a different day.</p>
        <Button onClick={onGenerate} className="inline-flex items-center gap-[0.4rem]">
          <Star /> Generate AI Plan
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {meals.map((meal, i) => (
        <MealCard
          key={i}
          meal={meal}
          index={i}
          swapping={swappingIndex === i}
          flash={flashIndex === i}
          onToggleDone={onToggleDone}
          onSwap={onSwap}
        />
      ))}
    </div>
  );
}
