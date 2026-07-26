import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Bolt, Check } from '@/components/icons';
import { Button } from '@/components/ui/button';

const FEATURES = [
  'Unlimited AI meal plans, every week',
  'Full grocery list with one click',
  'PDF export — print and take it shopping',
  'Unlimited AI coaching with Mia',
  'Advanced macros broken down per meal'
];

export default function LimitModal({ open, onOpenChange }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[300] bg-black/55 backdrop-blur-sm data-[state=open]:animate-fade-in motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[300] w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-cream p-[2.25rem_2rem] text-center shadow-xl outline-none"
        >
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(32,88%,92%)] text-[hsl(25,85%,40%)] dark:bg-[hsl(32,50%,16%)]">
            <Bolt width="24" height="24" />
          </div>
          <Dialog.Title className="mb-[0.6rem] font-display text-[1.45rem] font-black italic tracking-[-0.03em] text-foreground">
            You've used your free plans
          </Dialog.Title>
          <p className="mb-6 text-[0.9rem] leading-[1.65] text-muted-fg">
            You've hit the 3 plan limit for this month. Upgrade to Pro for unlimited plans and everything below — or wait until next month.
          </p>
          <ul className="mb-6 list-none p-0 text-left">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-[0.6rem] border-b border-hairline py-[0.4rem] text-[0.88rem] text-foreground last:border-b-0">
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-green text-white">
                  <Check width="11" height="11" />
                </span>
                {f}
              </li>
            ))}
          </ul>
          <Button
            href="/upgrade.html"
            full
            size="lg"
            onClick={() => { try { localStorage.setItem('mealzy_upgrade_source', 'limit_modal'); } catch { /* ignore */ } }}
          >
            Start Pro — 7 Days Free
          </Button>
          <Dialog.Close asChild>
            <button
              type="button"
              className="mt-3 cursor-pointer border-none bg-transparent font-body text-[0.82rem] text-muted-fg underline decoration-1 underline-offset-2 hover:text-foreground"
            >
              Maybe next month
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
