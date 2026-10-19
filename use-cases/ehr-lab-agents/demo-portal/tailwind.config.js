/** Colours resolve to CSS variables (src/index.css) so light and dark themes swap in one place. */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        sunken: token('sunken'),
        line: token('line'),
        ink: { DEFAULT: token('ink'), soft: token('ink-soft'), muted: token('ink-muted') },
        brand: { DEFAULT: token('brand'), soft: token('brand-soft'), ink: token('brand-ink') },
        good: { DEFAULT: token('good'), soft: token('good-soft'), ink: token('good-ink') },
        watch: { DEFAULT: token('watch'), soft: token('watch-soft'), ink: token('watch-ink') },
        act: { DEFAULT: token('act'), soft: token('act-soft'), ink: token('act-ink') },
        ai: { DEFAULT: token('ai'), soft: token('ai-soft'), ink: token('ai-ink') },
        ehr: token('ehr'),
        lab: token('lab'),
        physician: token('physician'),
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.06)',
        pop: '0 12px 32px -8px rgb(16 24 40 / 0.18)',
      },
    },
  },
  plugins: [],
}
