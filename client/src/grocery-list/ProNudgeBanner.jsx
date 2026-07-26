import { Star } from '@/components/icons';
import { track } from '@/lib/api';

/* Non-Pro nudge — legacy #proNudgeBanner, shown when mealzy_pro !== 'true'. */
export default function ProNudgeBanner() {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-md border border-clr-border bg-green/10 px-5 py-3.5 text-sm text-green-deep dark:text-green-light">
      <span className="flex items-center gap-2">
        <Star className="shrink-0" />
        <span>
          <strong>Pro unlocks PDF export + unlimited grocery lists</strong> — share your list or print it in one tap.
        </span>
      </span>
      <a
        href="/upgrade.html"
        onClick={() => track('upgrade_click', { source: 'grocery_banner' })}
        className="shrink-0 whitespace-nowrap rounded-md bg-green px-4 py-1.5 text-sm font-bold text-white no-underline"
      >
        Upgrade to Pro &rarr;
      </a>
    </div>
  );
}
