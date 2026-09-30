/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Microsoft YaHei", "PingFang SC", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
