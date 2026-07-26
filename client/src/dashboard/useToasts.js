import * as React from 'react';

let nextId = 1;

/* Ported from legacy showToast()/toastContainer — auto-dismiss after 3.5s. */
export default function useToasts() {
  const [toasts, setToasts] = React.useState([]);

  const showToast = React.useCallback((message, type = '') => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3500);
  }, []);

  return { toasts, showToast };
}
