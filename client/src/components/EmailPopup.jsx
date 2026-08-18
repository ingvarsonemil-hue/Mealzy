import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { submitEmailLead } from '@/lib/api';
import { isValidEmail } from '@/lib/utils';

/* Lead capture modal — same triggers as the original landing.js:
 * one per session; 45 s timer, or exit intent (mouseleave at top) on desktop /
 * 30 s on touch devices. Skipped if the visitor already submitted an email. */
export default function EmailPopup() {
  const [open, setOpen] = React.useState(false);
  const [exitVariant, setExitVariant] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    const trigger = (exit) => {
      if (sessionStorage.getItem('mealzy_popup_shown') || localStorage.getItem('mealzy_email_submitted')) return;
      sessionStorage.setItem('mealzy_popup_shown', '1');
      setExitVariant(exit);
      setOpen(true);
    };

    const timer = setTimeout(() => trigger(false), 45000);
    let touchTimer;
    const onMouseLeave = (e) => { if (e.clientY <= 0) trigger(true); };

    if ('ontouchstart' in window) {
      touchTimer = setTimeout(() => trigger(true), 30000);
    } else {
      document.addEventListener('mouseleave', onMouseLeave);
    }
    return () => {
      clearTimeout(timer);
      clearTimeout(touchTimer);
      document.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  const submit = () => {
    const value = email.trim();
    if (!isValidEmail(value)) {
      setError(true);
      inputRef.current?.focus();
      return;
    }
    setError(false);
    submitEmailLead(value);
    localStorage.setItem('mealzy_email_submitted', '1');
    window.location.href = 'login.html?signup=1&email=' + encodeURIComponent(value);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 data-[state=open]:animate-fade-in motion-reduce:animate-none" />
        <Dialog.Content
          aria-labelledby="popup-title"
          className="fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-forest-line bg-forest p-7 text-on-forest shadow-xl outline-none data-[state=open]:animate-fade-in motion-reduce:animate-none sm:p-8"
        >
          <Dialog.Title id="popup-title" className="font-display text-2xl font-bold italic leading-[1.15] text-on-forest">
            {exitVariant ? 'Wait — save your free plan' : 'Save your meal plan'}
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-[15px] leading-[1.6] text-on-forest-body">
            {exitVariant
              ? 'Create a free account and your meal plan is always saved — access it any time, on any device.'
              : 'Enter your email to create a free account — your plan stays saved and resets every 30 days. No card needed.'}
          </Dialog.Description>
          <p className="mt-2 text-sm text-on-forest-muted">Free: 1 plan a day for your first 30 days. Pro removes the limits.</p>

          <div className="mt-5 flex flex-col gap-3">
            <input
              ref={inputRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="your@email.com"
              aria-label="Email address"
              aria-invalid={error || undefined}
              aria-describedby={error ? 'popupEmailError' : undefined}
              className="h-12 w-full rounded-md border border-forest-line bg-white/10 px-4 text-base text-on-forest placeholder:text-white/70 focus:border-green-light focus:outline-none focus:ring-[3px] focus:ring-green-light/20"
            />
            <Button full size="lg" onClick={submit}>Build My Free Plan</Button>
          </div>
          {error && (
            <div id="popupEmailError" role="alert" className="mt-2 text-sm font-medium text-[var(--color-error-light)]">
              Please enter a valid email.
            </div>
          )}
          <p className="mt-4 text-xs text-on-forest-muted">We never sell your data. Unsubscribe any time.</p>
          <Dialog.Close asChild>
            <button className="mt-4 cursor-pointer text-sm text-on-forest-muted underline underline-offset-2 hover:text-on-forest">
              No thanks
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
