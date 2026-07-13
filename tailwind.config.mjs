/** Tailwind theme mapped 1:1 onto the Mealzy design tokens (tokens.css /
 * mealzy-design skill). Components must use these names, never raw hex. */
export default {
  content: ['./client/index.html', './client/src/**/*.{js,jsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        /* Theme-constant brand colors use RGB triplets so Tailwind opacity
         * modifiers (bg-green/10 etc.) work. Theme-switching colors stay as
         * plain var() and must not take opacity modifiers. */
        forest: 'rgb(var(--rgb-forest) / <alpha-value>)',
        'forest-deep': 'rgb(var(--rgb-forest-deep) / <alpha-value>)',
        green: 'rgb(var(--rgb-green) / <alpha-value>)',
        'green-deep': 'var(--clr-green-deep)',
        'green-light': 'rgb(var(--rgb-green-light) / <alpha-value>)',
        'green-muted': 'var(--color-green-muted)',
        error: 'rgb(var(--rgb-error) / <alpha-value>)',
        foreground: 'var(--color-foreground)',
        'muted-fg': 'var(--color-muted-fg)',
        cream: 'var(--color-cream)',
        parchment: 'var(--color-parchment)',
        'muted-bg': 'var(--color-muted-bg)',
        'border-warm': 'var(--color-border)',
        hairline: 'var(--color-hairline)',
        brick: 'var(--color-brick)',
        'on-forest': 'var(--clr-on-forest)',
        'on-forest-strong': 'var(--clr-on-forest-strong)',
        'on-forest-body': 'var(--clr-on-forest-body)',
        'on-forest-muted': 'var(--clr-on-forest-muted)',
        'on-forest-faint': 'var(--clr-on-forest-faint)',
        'forest-raise': 'var(--clr-forest-raise)',
        'forest-line': 'var(--clr-forest-line)'
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        sm: '6px',
        md: '12px',
        lg: '20px',
        xl: '32px'
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        button: 'var(--shadow-button)',
        card: 'var(--shadow-card)'
      },
      maxWidth: {
        container: '1160px',
        prose: '680px'
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'slide-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' }
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in': 'slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: []
};
