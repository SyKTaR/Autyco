/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#f6f8fb',
        paper: '#080a0e',
        surface: '#12161c',
        soft: '#1b212a',
        line: '#2c3440',
        control: '#7f8997',
        muted: '#aeb7c4',
        drive: '#79a7ff',
        'drive-soft': '#18243a',
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
        card: '0 16px 44px rgba(0, 0, 0, 0.24)',
        raised: '0 28px 80px rgba(0, 0, 0, 0.46)',
        inset: 'inset 0 1px 0 rgba(255, 255, 255, 0.035)',
      },
    },
  },
  plugins: [],
}
