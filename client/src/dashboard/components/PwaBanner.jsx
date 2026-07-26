import * as React from 'react';
import { X } from '@/components/icons';
import { btnPrimary, btnSm } from '../buttonStyles';

export default function PwaBanner({ visible, onInstall, onDismiss }) {
  if (!visible) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-[300] flex flex-wrap items-center justify-between gap-3 rounded-lg border border-clr-border bg-clr-surface p-4 shadow-xl sm:inset-x-auto sm:right-4 sm:max-w-sm">
      <div>
        <div className="font-semibold text-foreground">Add Mealzy to your home screen</div>
        <div className="mt-0.5 text-sm text-muted-fg">Get the full app experience — offline access, faster loading</div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onInstall} className={btnPrimary + ' ' + btnSm}>Install App</button>
        <button onClick={onDismiss} aria-label="Dismiss" className="text-muted-fg">
          <X width="16" height="16" />
        </button>
      </div>
    </div>
  );
}
