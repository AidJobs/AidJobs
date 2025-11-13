/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: [
          '"SF Mono"',
          'Monaco',
          '"Cascadia Code"',
          '"Roboto Mono"',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        // Apple-style type scale
        'display-lg': ['72px', { lineHeight: '80px', letterSpacing: '-0.02em' }],
        'display': ['56px', { lineHeight: '64px', letterSpacing: '-0.02em' }],
        'headline': ['40px', { lineHeight: '48px', letterSpacing: '-0.01em' }],
        'title': ['28px', { lineHeight: '34px', letterSpacing: '-0.01em' }],
        'body-lg': ['20px', { lineHeight: '28px', letterSpacing: '0' }],
        'body': ['17px', { lineHeight: '24px', letterSpacing: '0' }],
        'body-sm': ['15px', { lineHeight: '20px', letterSpacing: '0' }],
        'caption': ['13px', { lineHeight: '18px', letterSpacing: '0' }],
        'caption-sm': ['11px', { lineHeight: '16px', letterSpacing: '0.01em' }],
      },
      colors: {
        background: 'hsl(var(--bg))',
        foreground: 'hsl(var(--fg))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        surface: 'hsl(var(--surface))',
        'surface-2': 'hsl(var(--surface-2))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
        },
        accent: 'hsl(var(--accent))',
        'accent-foreground': 'hsl(var(--accent-foreground))',
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        danger: 'hsl(var(--danger))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // Admin login colors (keep for admin pages)
        'admin-gray': '#aaaaaa',
        'admin-gray-light': '#bbbbbb',
      },
      spacing: {
        // Apple-style spacing (4px base unit)
        '18': '4.5rem', // 72px
        '22': '5.5rem', // 88px
      },
      borderRadius: {
        // Subtle rounded corners
        'none': '0',
        'sm': '4px',
        'DEFAULT': '8px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
      },
      boxShadow: {
        // Apple-style subtle shadows
        'sm': '0 1px 3px rgba(0, 0, 0, 0.1)',
        'DEFAULT': '0 4px 12px rgba(0, 0, 0, 0.1)',
        'md': '0 4px 12px rgba(0, 0, 0, 0.1)',
        'lg': '0 8px 24px rgba(0, 0, 0, 0.12)',
      },
      transitionTimingFunction: {
        'apple': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        'apple': '300ms',
      },
      transitionProperty: {
        'width': 'width',
        'spacing': 'margin, padding',
      },
    },
  },
  plugins: [],
};
