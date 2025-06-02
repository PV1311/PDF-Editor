/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    fontFamily: {
      sans: 'sans-serif, monospace',
    },

    extend: {
      // fontSize: {
      //   huge: ['80rem', { lineHeight: '1' }],
      // },
      height: {
        screen: '100dvh',
      },
    },
  },
  plugins: [],
} 