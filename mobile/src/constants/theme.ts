export const Colors = {
  light: {
    background: '#ffffff',
    text: '#11181c',
    textSecondary: '#5a6672',
  },
  dark: {
    background: '#151718',
    text: '#ececed',
    textSecondary: '#9ba1a6',
  },
} as const;

export type ColorScheme = keyof typeof Colors;

export const Spacing = {
  one: 4,
  two: 8,
  three: 16,
  four: 24,
} as const;

/**
 * Locked brand tokens shared with the web app's public/css/tokens.css
 * (--color-cream, --color-green, --color-green-muted). Additive only: these
 * do not replace the generic light/dark `Colors` above, which existing
 * screens still use. Scoped for now to the Phase A locked-design screens
 * (starting with Plan) rather than applied app-wide.
 */
export const BrandColors = {
  cream: '#f8f5f0',
  green: '#059669',
  greenMuted: '#a8d5ba',
  ink: '#11181c',
  inkMuted: '#5a6672',
  separator: '#e8e1d4',
} as const;
