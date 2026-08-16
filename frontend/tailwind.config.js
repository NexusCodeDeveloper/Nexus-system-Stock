/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', 'system-ui', 'Roboto', '"Segoe UI"', 'sans-serif'],
      },
      colors: {
        ios: {
          bg: 'rgb(var(--ios-bg) / <alpha-value>)',
          surface: 'rgb(var(--ios-surface) / <alpha-value>)',
          surface2: 'rgb(var(--ios-surface2) / <alpha-value>)',
          surface3: 'rgb(var(--ios-surface3) / <alpha-value>)',
          separator: 'rgb(var(--ios-separator) / <alpha-value>)',
          label: 'rgb(var(--ios-label) / <alpha-value>)',
          secondary: 'rgb(var(--ios-secondary))',
          tertiary: 'rgb(var(--ios-tertiary))',
          hover: 'rgb(var(--ios-hover) / <alpha-value>)',
          tint: '#0A84FF',
          green: '#32D74B',
          red: '#FF453A',
          orange: '#FF9F0A',
          yellow: '#FFD60A',
          purple: '#BF5AF2',
          cyan: '#64D2FF',
          gray: '#98989D',
        },
      },
      borderRadius: {
        'ios-alert': '24px',
        'ios-sheet': '28px',
        'ios-control': '13px',
        'ios-pill': '999px',
      },
      boxShadow: {
        'ios-card': '0 1px 0 rgba(0,0,0,0.4), 0 12px 32px rgba(0,0,0,0.35)',
        'ios-alert': '0 4px 16px rgba(0,0,0,0.4), 0 24px 60px rgba(0,0,0,0.5)',
        'ios-sheet': '0 -4px 24px rgba(0,0,0,0.35), 0 -24px 80px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
};