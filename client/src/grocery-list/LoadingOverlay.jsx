/* Non-dismissible overlay shown while POST /api/generate-grocery-list is in
 * flight — legacy #loadingOverlay .open. Plain fixed div (not a Radix
 * Dialog): nothing should be able to close it early, there's no focus trap
 * requirement since it's a brief, non-interactive wait state. */
export default function LoadingOverlay({ open }) {
  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Generating grocery list"
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-6"
    >
      <div className="w-full max-w-[300px] rounded-lg bg-cream p-10 text-center shadow-xl">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-clr-border border-t-green motion-reduce:animate-none"
        />
        <h3 className="font-display text-lg font-bold italic text-foreground">Generating grocery list...</h3>
        <p className="mt-2 text-sm text-muted-fg">Consolidating ingredients from your meals</p>
      </div>
    </div>
  );
}
