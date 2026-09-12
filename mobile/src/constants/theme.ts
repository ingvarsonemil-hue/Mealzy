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
 * Locked Mealzy mobile brand tokens.
 *
 * Forest is the singular primary CTA color. Green is reserved for
 * selection/state/accent. Keep those roles distinct when consuming these
 * tokens in screens and components.
 */
export const BrandColors = {
  cream: '#F8F5F0',
  forest: '#253C2D',
  green: '#3D8B5E',
  paleGreen: '#EEF3EE',
  parchment: '#F2EDE6',
  white: '#FFFFFF',
  foreground: '#1A1A1A',
  muted: '#4B5563',
  border: '#E5E0D8',
  hairline: '#EDE8E0',
  destructive: '#8C2F2F',
} as const;
