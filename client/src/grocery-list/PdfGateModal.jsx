import * as Dialog from '@radix-ui/react-dialog';
import { Cart, X } from '@/components/icons';
import { Button } from '@/components/ui/button';

/* Non-Pro "Download PDF" click -> upsell modal instead of window.print().
 * Legacy printGroceryList() built this same dialog by hand (raw DOM +
 * inline styles); using Radix Dialog here for the focus trap / Escape /
 * focus-return that the legacy version didn't have, same copy and links. */
export default function PdfGateModal({ open, onOpenChange }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-fade-in motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby="pdf-gate-desc"
          className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-cream p-8 text-center text-foreground shadow-xl outline-none data-[state=open]:animate-fade-in motion-reduce:animate-none"
        >
          <Dialog.Close asChild>
            <button
              aria-label="Close"
              className="absolute right-3 top-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-fg hover:bg-clr-border/50"
            >
              <X width="18" height="18" />
            </button>
          </Dialog.Close>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green/10 text-green">
            <Cart width="22" height="22" />
          </div>
          <Dialog.Title className="mt-3 font-display text-lg font-bold italic text-foreground">
            Download grocery list as PDF
          </Dialog.Title>
          <p id="pdf-gate-desc" className="mt-2 text-[15px] leading-relaxed text-muted-fg">
            Print your grocery list or save it to your phone. Pro feature — upgrade to unlock.
          </p>
          <Button href="/upgrade.html" full className="mt-5">
            Upgrade to Pro &rarr;
          </Button>
          <a href="/upgrade.html" className="mt-3 inline-block text-[13px] text-muted-fg underline">
            See all plans
          </a>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
