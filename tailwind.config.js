/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // driven by the `dark` class on <html> (src/lib/theme.ts), so the in-app toggle can override the system
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
};
