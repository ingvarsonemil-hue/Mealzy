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

/* App-shell nav icons — same paths as the legacy sidebar SVGs (public/dashboard.html etc). */
export const NavDashboard = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...base} strokeWidth="1.8" aria-hidden="true" {...props}>
    <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1v-9.5z" />
    <path d="M9 21V12h6v9" />
  </svg>
);

export const NavPlanner = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...base} strokeWidth="1.8" aria-hidden="true" {...props}>
    <path d="M5 12h14a7 7 0 01-14 0z" />
    <path d="M8.5 9c0-1.5 1-1.5 1-3" />
    <path d="M13.5 9c0-1.5 1-1.5 1-3" />
  </svg>
);

export const NavGroceries = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...base} strokeWidth="1.8" aria-hidden="true" {...props}>
    <path d="M6 2h12l2 5v13a1 1 0 01-1 1H5a1 1 0 01-1-1V7l2-5z" />
    <path d="M9 7a3 3 0 006 0" />
  </svg>
);

export const NavAnalytics = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...base} strokeWidth="1.8" aria-hidden="true" {...props}>
    <rect x="3" y="12" width="4" height="9" rx="1" />
    <rect x="10" y="7" width="4" height="14" rx="1" />
    <rect x="17" y="4" width="4" height="17" rx="1" />
  </svg>
);

export const NavCoach = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...base} strokeWidth="1.8" aria-hidden="true" {...props}>
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    <path d="M12 8v1m0 2v1m-2-2h1m2 0h1" strokeWidth="1.5" />
  </svg>
);

export const NavRecipes = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...base} strokeWidth="1.8" aria-hidden="true" {...props}>
    <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
    <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
  </svg>
);

export const NavSettings = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...base} strokeWidth="1.8" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

export const LogOut = (props) => (
  <svg viewBox="0 0 24 24" width="14" height="14" {...base} strokeWidth="1.75" aria-hidden="true" {...props}>
    <path d="M3.5 21V3H13C13.5 3 14 3.5 14 4V20C14 20.5 13.5 21 13 21H3.5Z" />
    <path d="M9 3.5V20.5" />
    <path d="M17 12H22" />
    <path d="M19.5 9L22 12L19.5 15" />
  </svg>
);

/* Grocery-list page icons — same paths as the legacy public/grocery-list.html
 * inline SVGs (cart, star, category icons, PDF/file icon). */
export const Cart = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

export const Star = (props) => (
  <svg viewBox="0 0 24 24" width="14" height="14" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

export const FileDown = (props) => (
  <svg viewBox="0 0 24 24" width="14" height="14" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

export const CategoryProduce = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  </svg>
);

export const CategoryProtein = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M16.4 13.7A6.5 6.5 0 1 0 6.28 6.6c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c4 0 8.4-1.8 11.4-4.3" />
    <path d="m18.5 6 2.19 4.5a6.48 6.48 0 0 1-2.29 7.2C15.4 20.2 11 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5" />
    <circle cx="12.5" cy="8.5" r="2.5" />
  </svg>
);

export const CategoryDairy = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M12 2C8 2 4 8 4 14a8 8 0 0 0 16 0c0-6-4-12-8-12" />
  </svg>
);

export const CategoryGrains = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M2 22 16 8" />
    <path d="M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
    <path d="M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
    <path d="M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
    <path d="M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z" />
    <path d="M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z" />
    <path d="M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z" />
    <path d="M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z" />
  </svg>
);

export const CategoryPantry = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M10 2v5.632c0 .424-.272.795-.653.982A6 6 0 0 0 6 14c.006 4 3 7 5 8" />
    <path d="M10 5H8a2 2 0 0 0 0 4h.68" />
    <path d="M14 2v5.632c0 .424.272.795.652.982A6 6 0 0 1 18 14c0 4-3 7-5 8" />
    <path d="M14 5h2a2 2 0 0 1 0 4h-.68" />
    <path d="M18 22H6" /><path d="M9 2h6" />
  </svg>
);

export const CategoryFrozen = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="m10 20-1.25-2.5L6 18" /><path d="M10 4 8.75 6.5 6 6" />
    <path d="m14 20 1.25-2.5L18 18" /><path d="m14 4 1.25 2.5L18 6" />
    <path d="m17 21-3-6h-4" /><path d="m17 3-3 6 1.5 3" />
    <path d="M2 12h6.5L10 9" /><path d="m20 10-1.5 2 1.5 2" />
    <path d="M22 12h-6.5L14 15" /><path d="m4 10 1.5 2L4 14" />
    <path d="m7 21 3-6-1.5-3" /><path d="m7 3 3 6h4" />
  </svg>
);

export const CategoryBeverages = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8" />
    <path d="M5 8h14" />
    <path d="M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0" />
    <path d="m12 8 1-6h2" />
  </svg>
);

export const CategoryOther = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M16 10a4 4 0 0 1-8 0" />
    <path d="M3.103 6.034h17.794" />
    <path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z" />
  </svg>
);

/* Meal-planner page icons — same paths as public/meal-planner.html's inline
 * ICO map and other inline SVGs (day-view meal stats, week view, share panel,
 * limit modal/banner, error/empty states, print/regenerate controls). */
export const Flame = (props) => (
  <svg viewBox="0 0 24 24" width="12" height="12" {...base} strokeWidth="1.75" aria-hidden="true" {...props}>
    <path d="M12 3C12 3 10 7 9 9.5C8 8 8 6 9 4C6.5 6.5 6 9 6 11.5C6 15.8 8.7 19 12 19C15.3 19 18 15.8 18 11.5C18 9 17.5 7.5 16 6C16.5 7.5 16.5 9 16 10.5C15 8.5 14.5 6.5 12 3Z" />
  </svg>
);

export const Zap = (props) => (
  <svg viewBox="0 0 24 24" width="12" height="12" {...base} strokeWidth="1.75" aria-hidden="true" {...props}>
    <path d="M14 3L6.5 13H12.5L10 21.5C13 18 17.5 13.5 18 10.5H12.5L14 3Z" />
  </svg>
);

export const Wheat = (props) => (
  <svg viewBox="0 0 24 24" width="12" height="12" {...base} strokeWidth="1.75" aria-hidden="true" {...props}>
    <path d="M12 4V21" />
    <path d="M12 8.5C11 7.5 9.5 7 9 5.5C10.5 5.5 12 7 12 8.5Z" />
    <path d="M12 13C11 12 9.5 11.5 9 10C10.5 10 12 11.5 12 13Z" />
    <path d="M12 8.5C13 7.5 14.5 7 15 5.5C13.5 5.5 12 7 12 8.5Z" />
    <path d="M12 13C13 12 14.5 11.5 15 10C13.5 10 12 11.5 12 13Z" />
  </svg>
);

export const Droplet = (props) => (
  <svg viewBox="0 0 24 24" width="12" height="12" {...base} strokeWidth="1.75" aria-hidden="true" {...props}>
    <path d="M12 3.5L5.5 13C5.5 17 8.5 20.5 12 20.5C15.5 20.5 18.5 17 18.5 13L12 3.5Z" />
  </svg>
);

export const ClockIcon = (props) => (
  <svg viewBox="0 0 24 24" width="12" height="12" {...base} strokeWidth="1.75" aria-hidden="true" {...props}>
    <path d="M12 4.5C8 4.5 4.5 8 4.5 12C4.5 16 8 19.5 12 19.5C16 19.5 19.5 16 19.5 12C19.5 8 16 4.5 12 4.5Z" />
    <path d="M12 8V12.5L15.5 14.5" />
  </svg>
);

export const CalendarIcon = (props) => (
  <svg viewBox="0 0 24 24" width="56" height="56" {...base} strokeWidth="1.5" aria-hidden="true" {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

export const Printer = (props) => (
  <svg viewBox="0 0 24 24" width="14" height="14" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

export const Refresh = (props) => (
  <svg viewBox="0 0 24 24" width="14" height="14" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

export const ChevronRight = (props) => (
  <svg viewBox="0 0 24 24" width="10" height="10" {...base} strokeWidth="2.5" aria-hidden="true" {...props}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export const Bolt = (props) => (
  <svg viewBox="0 0 24 24" width="14" height="14" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

export const AlertCircle = (props) => (
  <svg viewBox="0 0 24 24" width="22" height="22" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export const ShareIcon = (props) => (
  <svg viewBox="0 0 24 24" width="14" height="14" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
);

export const Copy = (props) => (
  <svg viewBox="0 0 24 24" width="13" height="13" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
);

export const XLogo = (props) => (
  <svg viewBox="0 0 24 24" width="13" height="13" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" />
  </svg>
);

export const WhatsApp = (props) => (
  <svg viewBox="0 0 24 24" width="13" height="13" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

/* Dashboard-only icons — same paths as the legacy public/dashboard.html
 * inline SVGs (meal rating thumbs, water +/-, quick-action tiles). */
export const ThumbUp = (props) => (
  <svg viewBox="0 0 24 24" width="12" height="12" {...base} strokeWidth="1.75" aria-hidden="true" {...props}>
    <path d="M7 22V11L12 3L13.5 3.5C14 3.7 14.5 4.3 14.5 5V9H20C20.8 9 21.5 9.7 21.5 10.5L20 18C19.8 19 19 19.5 18.2 19.5H7" />
    <path d="M7 11H3.5C3 11 2.5 11.5 2.5 12V21.5C2.5 22 3 22.5 3.5 22.5H7" />
  </svg>
);

export const ThumbDown = (props) => (
  <svg viewBox="0 0 24 24" width="12" height="12" {...base} strokeWidth="1.75" aria-hidden="true" {...props}>
    <path d="M17 2V13L12 21L10.5 20.5C10 20.3 9.5 19.7 9.5 19V15H4C3.2 15 2.5 14.3 2.5 13.5L4 6C4.2 5 5 4.5 5.8 4.5H17" />
    <path d="M17 13H20.5C21 13 21.5 12.5 21.5 12V2.5C21.5 2 21 1.5 20.5 1.5H17" />
  </svg>
);

export const Plus = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const Minus = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...base} strokeWidth="2" aria-hidden="true" {...props}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const ChatSparkle = (props) => (
  <svg viewBox="0 0 24 24" width="24" height="24" {...base} strokeWidth="1.75" aria-hidden="true" {...props}>
    <path d="M3.5 5.5C3.5 4.2 4.5 3.5 5.5 3.5H18.5C19.5 3.5 20.5 4.2 20.5 5.5V13.5C20.5 14.8 19.5 15.5 18.5 15.5H9.5L5.5 19.5V15.5C4.5 15.5 3.5 14.8 3.5 13.5V5.5Z" />
    <path d="M12 7.5L12.4 9L13.8 9.5L12.4 10L12 11.5L11.6 10L10.2 9.5L11.6 9L12 7.5Z" />
  </svg>
);

export const BarChart = (props) => (
  <svg viewBox="0 0 24 24" width="24" height="24" {...base} strokeWidth="1.75" aria-hidden="true" {...props}>
    <path d="M4.5 20V13C4.5 12.5 4.8 12 5.3 12H8.2C8.7 12 9 12.5 9 13V20" />
    <path d="M10.5 20V7C10.5 6.5 10.8 6 11.3 6H14.2C14.7 6 15 6.5 15 7V20" />
    <path d="M16.5 20V16C16.5 15.5 16.8 15 17.3 15H20.2C20.7 15 21 15.5 21 16V20" />
    <path d="M3 20H21.5" />
  </svg>
);

export const FileImport = (props) => (
  <svg viewBox="0 0 24 24" width="24" height="24" {...base} strokeWidth="1.75" aria-hidden="true" {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <line x1="9" y1="15" x2="15" y2="15" />
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
