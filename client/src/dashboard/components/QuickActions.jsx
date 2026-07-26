import * as React from 'react';
import { ChatSparkle, Cart, BarChart, FileImport } from '@/components/icons';

const CARD_CLASS =
  'block rounded-md border border-clr-border bg-clr-surface p-5 text-left no-underline shadow-[0_1px_4px_rgba(26,61,43,0.07)] transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-green hover:shadow-lg dark:border-white/10 dark:bg-white/5';

export default function QuickActions({ onImportRecipe }) {
  return (
    <div className="mb-6">
      <h2 className="mb-4 text-base font-bold text-foreground">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <a href="/ai-coach.html" className={CARD_CLASS}>
          <ChatSparkle className="mb-2.5 block text-green" />
          <div className="font-display text-base font-bold text-foreground">Ask Mia</div>
          <p className="mt-1 text-sm text-muted-fg">Get instant nutrition advice</p>
        </a>
        <a href="/grocery-list.html" className={CARD_CLASS}>
          <Cart width="24" height="24" className="mb-2.5 block text-green" />
          <div className="font-display text-base font-bold text-foreground">Grocery List</div>
          <p className="mt-1 text-sm text-muted-fg">Build this week's shopping list</p>
        </a>
        <a href="/analytics.html" className={CARD_CLASS}>
          <BarChart className="mb-2.5 block text-green" />
          <div className="font-display text-base font-bold text-foreground">View Progress</div>
          <p className="mt-1 text-sm text-muted-fg">Track calories and macros</p>
        </a>
        <button onClick={onImportRecipe} className={CARD_CLASS + ' w-full cursor-pointer font-body'}>
          <FileImport className="mb-2.5 block text-green" />
          <div className="font-display text-base font-bold text-foreground">Import Recipe</div>
          <p className="mt-1 text-sm text-muted-fg">Scan or paste a recipe</p>
        </button>
      </div>
    </div>
  );
}
