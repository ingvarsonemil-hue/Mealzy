import { CATEGORY_CONFIG } from './categoryConfig';
import { Cart, Star } from '@/components/icons';
import { Button } from '@/components/ui/button';

function EmptyState({ heading, copy, onGenerate }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-hairline bg-cream px-6 py-12 text-center shadow-card">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green/10 text-green">
        <Cart width="28" height="28" />
      </div>
      <h3 className="mt-4 font-display text-xl font-bold italic text-foreground">{heading}</h3>
      {copy && <p className="mx-auto mt-2 max-w-sm text-sm text-muted-fg">{copy}</p>}
      {onGenerate && (
        <Button onClick={onGenerate} className="mt-5">
          <Star /> Generate Grocery List
        </Button>
      )}
    </div>
  );
}

export default function GroceryCategories({ groceryList, selectedDay, sym, onToggleItem, onGenerate }) {
  if (!groceryList || !groceryList.categories) {
    return (
      <EmptyState
        heading="No grocery list yet"
        copy={`No grocery list yet for ${selectedDay}. Generate one from your meal plan, or generate a smart list now.`}
        onGenerate={onGenerate}
      />
    );
  }

  const groups = CATEGORY_CONFIG
    .map((cfg) => ({ ...cfg, items: groceryList.categories[cfg.key] || [] }))
    .filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    return <EmptyState heading="All categories are empty" />;
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ key, Icon, label, items }) => (
        <div key={key} className="rounded-lg border border-hairline bg-cream shadow-card">
          <h3 className="flex items-center gap-2 border-b border-hairline px-5 py-3.5 font-display text-base font-bold italic text-foreground">
            <span className="flex items-center text-green" aria-hidden="true"><Icon /></span>
            <span>{label}</span>
            <span className="ml-auto rounded-full bg-green/20 px-2.5 py-0.5 text-xs font-bold text-green dark:bg-green-light/20 dark:text-green-light">
              {items.length}
            </span>
          </h3>
          <div>
            {items.map((item, idx) => (
              <div
                key={`${key}-${idx}`}
                className={`flex min-w-0 items-center gap-3 border-b border-hairline px-5 py-3 text-sm last:border-b-0 ${item.checked ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={!!item.checked}
                  aria-checked={!!item.checked}
                  aria-label={item.name}
                  onChange={(e) => onToggleItem(key, idx, e.target.checked)}
                  className="h-4 w-4 shrink-0 cursor-pointer rounded-sm border-clr-border text-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
                />
                <span className={`min-w-0 flex-1 truncate font-medium text-foreground ${item.checked ? 'line-through' : ''}`}>
                  {item.name}
                </span>
                <span className="shrink-0 whitespace-nowrap text-muted-fg">{item.amount || ''}</span>
                {item.cost ? (
                  <span className="shrink-0 whitespace-nowrap font-semibold text-foreground">{sym}{item.cost.toFixed(2)}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
