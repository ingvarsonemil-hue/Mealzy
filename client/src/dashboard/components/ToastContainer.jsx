import * as React from 'react';
import { cn } from '@/lib/utils';

export default function ToastContainer({ toasts }) {
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[10000] flex w-full max-w-[90vw] -translate-x-1/2 flex-col items-center gap-2 sm:left-auto sm:right-5 sm:translate-x-0 sm:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto rounded-md px-4 py-3 text-sm font-medium text-white shadow-lg',
            t.type === 'error' ? 'bg-error' : t.type === 'success' ? 'bg-green' : 'bg-forest'
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
