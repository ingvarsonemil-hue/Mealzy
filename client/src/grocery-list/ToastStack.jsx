import { cn } from '@/lib/utils';

const TYPE_STYLES = {
  success: 'border-green/30 bg-green/10 text-green-deep dark:text-green-light',
  error: 'border-error/30 bg-error/10 text-brick dark:text-red-300',
  '': 'border-clr-border bg-clr-surface text-foreground'
};

export default function ToastStack({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div
      className="fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 px-4 sm:bottom-6"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'w-full max-w-sm rounded-md border px-4 py-3 text-sm font-medium shadow-lg',
            TYPE_STYLES[t.type] || TYPE_STYLES['']
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
