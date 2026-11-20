/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        primary: '#a8dadc', // pastel teal
        secondary: '#f1faee',
        accent: '#457b9d',
      },
    },
  },
  plugins: [],
};
