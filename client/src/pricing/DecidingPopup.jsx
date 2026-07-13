import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { X } from '@/components/icons';
import { stripeUrls } from '@/lib/stripe';
import { track } from '@/lib/api';

const SEEN_KEY = 'pricing_popup_seen';

/* "Still deciding?" nudge — same timing contract as the legacy pricing.js:
 * appears once per session after 30s, CTA goes to the monthly Stripe link.
 * Radix Dialog supplies the focus trap, Escape handling, and focus return. */
export default function DecidingPopup() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let seen = false;
    try { seen = !!sessionStorage.getItem(SEEN_KEY); } catch (e) { /* private mode */ }
    if (seen) return;
    const t = setTimeout(() => setOpen(true), 30000);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* private mode */ }
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) dismiss(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-fade-in motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-forest p-8 text-on-forest shadow-xl outline-none data-[state=open]:animate-fade-in motion-reduce:animate-none"
        >
          <Dialog.Close asChild>
            <button
              aria-label="Close"
              className="absolute right-3 top-3 flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-on-forest-body transition-colors duration-150 hover:bg-forest-raise hover:text-on-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-light"
            >
              <X />
            </button>
          </Dialog.Close>
          <Dialog.Title className="font-display text-[1.75rem] font-bold italic leading-tight tracking-[-0.02em] text-on-forest">
            Still deciding?
          </Dialog.Title>
          <p className="mt-3 text-[15px] leading-relaxed text-on-forest-body">
            Try Pro <strong className="text-on-forest">free for 7 days</strong> — no credit card required.
            Cancel with one click if it&rsquo;s not for you.
          </p>
          <Button
            href={stripeUrls.monthly}
            target="_blank"
            rel="noopener"
            full
            className="mt-6"
            data-testid="popup-cta"
            onClick={() => { track('upgrade_click', { source: 'pricing_page', plan: 'pro' }); dismiss(); }}
          >
            Start Pro — 7 Days Free
          </Button>
          <p className="mt-3 text-center text-[13px] leading-normal text-on-forest-muted">
            No charge for 7 days. Cancel any time.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
