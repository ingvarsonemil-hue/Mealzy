/* Local button className recipes for the app-shell pages (dashboard,
 * meal-planner, grocery-list). The shared <Button> in components/ui/button.jsx
 * only has variants tuned for the marketing pages (primary/quiet/veil on
 * forest backgrounds) — app pages sit on --clr-canvas/--clr-surface, so this
 * page defines its own small set instead of stretching that component. */

export const btnPrimary =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-green px-4 py-2.5 text-sm font-semibold text-white shadow-button transition-colors duration-150 hover:bg-green-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green disabled:pointer-events-none disabled:opacity-60';

export const btnOutline =
  'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-clr-border bg-clr-surface px-4 py-2 text-sm font-semibold text-foreground no-underline transition-colors duration-150 hover:border-green hover:text-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green disabled:pointer-events-none disabled:opacity-60';

export const btnGhost =
  'inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-md border-none bg-transparent px-3 py-2 text-sm font-semibold text-green no-underline transition-colors duration-150 hover:bg-green/10 disabled:pointer-events-none disabled:opacity-60';

export const btnSm = 'text-[0.82rem] min-h-9 px-3 py-1.5';

export const iconBtn =
  'inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-muted-fg transition-colors duration-150 hover:text-foreground';
