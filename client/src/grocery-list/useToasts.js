import * as React from 'react';

/* Minimal toast stack — legacy showToast() appended a div to #toastContainer
 * and removed it after 3.5s. No shared Toast component exists yet in this
 * codebase, so this is a small page-local equivalent (not a design-system
 * addition). */
let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = React.useState([]);

  const addToast = React.useCallback((message, type = '') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return [toasts, addToast];
}
