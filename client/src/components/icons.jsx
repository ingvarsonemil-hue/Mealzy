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
