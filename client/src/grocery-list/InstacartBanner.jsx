import { Cart } from '@/components/icons';

const AMAZON_URL = 'https://www.amazon.com/s?k=grocery&tag=mealzy20-20';

function trackAmazonClick() {
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'instacart_click', { event_category: 'affiliate', event_label: 'grocery_list' });
    }
  } catch (e) { /* gtag not loaded */ }
}

/* Sticky footer affiliate banner. Hidden outside US/CA timezones — Amazon
 * affiliate tag only makes sense there. Timezone check ported verbatim from
 * legacy: startsWith('America/') || startsWith('US/') || startsWith('Canada/'),
 * on a try/catch that defaults to *visible* if Intl throws. */
export function isUsCaTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    return tz.startsWith('America/') || tz.startsWith('US/') || tz.startsWith('Canada/');
  } catch (e) {
    return true;
  }
}

export default function InstacartBanner() {
  return (
    <div
      role="region"
      aria-label="Order groceries online"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-clr-border bg-clr-surface px-5 py-2.5 md:left-[260px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-clr-surface text-green shadow-sm">
            <Cart />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground">Order your groceries on Amazon</div>
            <div className="text-[13px] text-muted-fg">Find ingredients on Amazon</div>
          </div>
        </div>
        <a
          href={AMAZON_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={trackAmazonClick}
          aria-label="Order groceries on Amazon (opens external site)"
          className="shrink-0 whitespace-nowrap rounded-md bg-green px-5 py-2.5 text-sm font-semibold text-white no-underline hover:bg-green-deep"
        >
          Order now &rarr;
        </a>
      </div>
      <div className="mt-2 text-right text-[11px] text-muted-fg">
        Affiliate link — Mealzy earns a small commission at no cost to you
      </div>
    </div>
  );
}
