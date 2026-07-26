/* Progress summary card: checked/total items, cost total, budget bar.
 * NOTE on budget: the legacy updateProgress()/updateProgressForEmpty()
 * functions always compute the budget denominator from `profile.budget`
 * and never read `groceryList.budgetAmount` (that field only ever appears
 * in the data shape, it's not rendered) — so the budget row is unconditional
 * here too, not gated on which endpoint produced the current list. See
 * GroceryListPage.jsx for the full note. */
export default function ProgressCard({ checked, total, pct, totalCost, budget, budgetPct, sym }) {
  return (
    <div className="rounded-lg border border-hairline bg-cream p-6 shadow-card">
      <div className="flex items-center justify-between text-sm font-medium text-foreground">
        <span>{checked} of {total} items checked</span>
        <span>{pct}%</span>
      </div>
      <div className="mt-2 h-[0.65rem] w-full overflow-hidden rounded-full bg-clr-border">
        <div
          className="h-full rounded-full bg-green transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-2">
        <div>
          <span className="text-sm text-muted-fg">Budget: </span>
          <span className="text-[0.9rem] font-bold text-foreground">{sym}{totalCost.toFixed(2)} / {sym}{budget}</span>
        </div>
        <div>
          <span className="text-sm text-muted-fg">Est. Total: </span>
          <span className="text-[0.9rem] font-bold text-green">{sym}{totalCost.toFixed(2)}</span>
        </div>
      </div>
      <div className="mt-2 h-[0.4rem] w-full overflow-hidden rounded-full bg-clr-border">
        <div
          className="h-full rounded-full bg-green-light transition-[width] duration-300"
          style={{ width: `${budgetPct}%` }}
        />
      </div>
    </div>
  );
}
