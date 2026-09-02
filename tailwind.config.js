/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)',
        paper: 'rgb(var(--paper) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        soft: 'rgb(var(--soft) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        control: 'rgb(var(--control) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        drive: 'rgb(var(--drive) / <alpha-value>)',
        'drive-soft': 'rgb(var(--drive-soft) / <alpha-value>)',
        'on-drive': 'rgb(var(--on-drive) / <alpha-value>)',
        signal: 'rgb(var(--accent) / <alpha-value>)',
        'signal-hover': 'rgb(var(--accent-strong) / <alpha-value>)',
        'signal-soft': 'rgb(var(--accent-soft) / <alpha-value>)',
        'on-signal': 'rgb(var(--on-accent) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        'success-soft': 'rgb(var(--success-soft) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        'warning-soft': 'rgb(var(--warning-soft) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          '"Avenir Next"',
          'Avenir',
          '"Segoe UI"',
          'sans-serif',
        ],
        display: [
          '"Avenir Next"',
          'Avenir',
          '"Helvetica Neue"',
          'sans-serif',
        ],
        mono: [
          '"SFMono-Regular"',
          'Consolas',
          '"Liberation Mono"',
          'monospace',
        ],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
        inset: 'var(--shadow-inset)',
      },
    },
  },
  plugins: [],
}
