/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#f5f7fb',
        paper: '#0b0d11',
        surface: '#171a21',
        soft: '#20242d',
        line: '#303641',
        control: '#7f8796',
        muted: '#aeb5c2',
        signal: 'rgb(var(--accent) / <alpha-value>)',
        'signal-hover': 'rgb(var(--accent-strong) / <alpha-value>)',
        'signal-soft': 'rgb(var(--accent-soft) / <alpha-value>)',
        success: '#73e0aa',
        warning: '#ffd18a',
        danger: '#ff93a3',
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
        card: '0 18px 48px rgba(0, 0, 0, 0.22)',
        raised: '0 24px 72px rgba(0, 0, 0, 0.38)',
      },
    },
  },
  plugins: [],
}
