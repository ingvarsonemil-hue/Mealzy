import * as React from 'react';
import { X } from '@/components/icons';
import { iconBtn } from '../buttonStyles';

/* Generic overlay used by every dashboard modal (recipe view, NPS, import
 * wizard, upgrade prompt). Mirrors the legacy `.modal-overlay` / `.modal`
 * behavior: fixed dark backdrop, click-outside to close, Escape to close. */
export default function Modal({
  open,
  onClose,
  children,
  maxWidth = '480px',
  closeOnBackdrop = true,
  showClose = false,
  labelledBy
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-forest/55 p-4 sm:p-6"
      onClick={closeOnBackdrop && onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative max-h-[90vh] w-full overflow-y-auto rounded-lg bg-clr-surface p-6 shadow-xl sm:p-7"
        style={{ maxWidth }}
      >
        {showClose && onClose && (
          <button onClick={onClose} aria-label="Close" className={iconBtn + ' absolute right-3 top-3'}>
            <X width="18" height="18" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
