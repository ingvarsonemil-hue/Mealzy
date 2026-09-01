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
