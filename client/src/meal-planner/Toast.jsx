import * as React from 'react';

let nextId = 1;

/* Minimal toast queue — mirrors the legacy showToast()/toast-container
 * behavior (auto-dismiss after 3.5s, success/error color variants). */
export function useToasts() {
  const [toasts, setToasts] = React.useState([]);

  const showToast = React.useCallback((message, type = '') => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((toast) => toast.id !== id));
    }, 3500);
  }, []);

  return { toasts, showToast };
}

export default function ToastContainer({ toasts }) {
  return (
    <div className="fixed bottom-6 right-6 z-[500] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={
            'animate-fade-in rounded-md px-5 py-3 text-[0.88rem] font-medium text-white shadow-lg ' +
            (t.type === 'success' ? 'bg-green' : t.type === 'error' ? 'bg-error' : 'bg-foreground')
          }
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
