import * as React from 'react';

const LOADING_MSGS = [
  'Calculating your macros...',
  'Building your grocery list...',
  'Optimising for your budget...',
  'Selecting the best proteins...',
  'Balancing your daily nutrients...',
  'Almost ready — adding the final touches...'
];

export default function LoadingOverlay({ open }) {
  const [msgIndex, setMsgIndex] = React.useState(0);
  const [fade, setFade] = React.useState(true);
  const [barPct, setBarPct] = React.useState(10);

  React.useEffect(() => {
    if (!open) {
      setMsgIndex(0);
      setFade(true);
      setBarPct(10);
      return;
    }
    let i = 0;
    const timer = setInterval(() => {
      i = Math.min(i + 1, LOADING_MSGS.length - 1);
      setFade(false);
      setTimeout(() => {
        setMsgIndex(i);
        setFade(true);
      }, 150);
      setBarPct(Math.min(90, 10 + (i / (LOADING_MSGS.length - 1)) * 80));
    }, 2000);
    return () => clearInterval(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-forest/55 p-4">
      <div className="w-full max-w-[320px] rounded-lg bg-clr-surface p-10 text-center shadow-xl">
        <span aria-hidden="true" className="mx-auto mb-5 inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-clr-border border-t-green motion-reduce:animate-none" />
        <h3 className="mb-2 font-semibold text-foreground">Building your plan...</h3>
        <p className="min-h-[1.5em] text-sm text-muted-fg transition-opacity duration-300" style={{ opacity: fade ? 1 : 0 }}>
          {LOADING_MSGS[msgIndex]}
        </p>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-clr-canvas">
          <div className="h-full rounded-full bg-green transition-[width] duration-[800ms] ease-out" style={{ width: `${barPct}%` }} />
        </div>
      </div>
    </div>
  );
}
