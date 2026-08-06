/* Inline SVG icons — same paths as the original page. No emoji, no icon fonts. */

const base = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' };

export const Check = (props) => (
  <svg viewBox="0 0 24 24" width="15" height="15" {...base} strokeWidth="2.5" aria-hidden="true" {...props}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const Shield = (props) => (
  <svg viewBox="0 0 24 24" width="15" height="15" {...base} strokeWidth="2.5" aria-hidden="true" {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

/* Three-quarter ring, spun by CSS. The gap is what makes the rotation legible —
 * a full circle turning looks like a circle standing still. */
export const Spinner = ({ className, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width="13"
    height="13"
    {...base}
    strokeWidth="2.5"
    aria-hidden="true"
    className={`animate-spin motion-reduce:animate-none${className ? ` ${className}` : ''}`}
    {...props}
  >
    <path d="M12 3a9 9 0 1 1-6.36 2.64" />
  </svg>
);

export const ArrowDown = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...base} strokeWidth="1.5" aria-hidden="true" {...props}>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </svg>
);

export const ChevronDown = ({ className, ...props }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...base} strokeWidth="1.5" className={className} aria-hidden="true" {...props}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const Sun = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

export const Moon = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const Menu = (props) => (
  <svg viewBox="0 0 24 24" width="24" height="24" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </svg>
);

export const X = (props) => (
  <svg viewBox="0 0 24 24" width="22" height="22" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const Eye = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOff = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export const Lock = (props) => (
  <svg viewBox="0 0 24 24" width="13" height="13" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const CircleCheck = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...base} strokeWidth="2.5" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export const HelpCircle = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

/* Meal-course marks for the sample plan. Line-art only, never emoji. */
export const Sunrise = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...base} strokeWidth="1.8" aria-hidden="true" {...props}>
    <path d="M12 3v3" />
    <path d="m5.6 8.6 2.1 2.1" />
    <path d="m18.4 8.6-2.1 2.1" />
    <path d="M8 17a4 4 0 0 1 8 0" />
    <line x1="3" y1="17" x2="5" y2="17" />
    <line x1="19" y1="17" x2="21" y2="17" />
    <line x1="4" y1="21" x2="20" y2="21" />
  </svg>
);

export const Bowl = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...base} strokeWidth="1.8" aria-hidden="true" {...props}>
    <path d="M3 11h18a9 9 0 0 1-9 9 9 9 0 0 1-9-9z" />
    <path d="M9 7c0-1.2.9-1.8.9-3" />
    <path d="M14.1 7c0-1.2.9-1.8.9-3" />
  </svg>
);

export const Cutlery = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...base} strokeWidth="1.8" aria-hidden="true" {...props}>
    <path d="M6 3v7a2 2 0 0 0 4 0V3" />
    <path d="M8 10v11" />
    <path d="M17 3c-1.7 1-2.5 2.8-2.5 5s.8 3.5 2.5 3.5V3z" />
    <path d="M17 11.5V21" />
  </svg>
);

/* Phone outline — marks the grocery list as something you shop from in-aisle. */
export const Phone = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...base} strokeWidth="1.8" aria-hidden="true" {...props}>
    <rect x="6" y="2" width="12" height="20" rx="2.5" />
    <line x1="11" y1="18.5" x2="13" y2="18.5" />
  </svg>
);

/* Two arrows trading places — the swap affordance on a meal card. */
export const Swap = (props) => (
  <svg viewBox="0 0 24 24" width="15" height="15" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M4 8h14" />
    <polyline points="15 5 18 8 15 11" />
    <path d="M20 16H6" />
    <polyline points="9 13 6 16 9 19" />
  </svg>
);

/* Google brand mark — official multicolor paths, fixed fills by design. */
export const GoogleLogo = (props) => (
  <svg viewBox="0 0 18 18" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
    <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05" />
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
  </svg>
);
