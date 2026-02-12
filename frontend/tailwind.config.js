/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["'DM Sans'", "'Noto Sans TC'", "ui-sans-serif", "system-ui"],
        body: ["'Inter'", "'Noto Sans TC'", "ui-sans-serif", "system-ui"]
      },
      colors: {
        ink: "#0f172a",
        sand: "#f8fafc",
        mint: "#34d399",
        amber: "#f59e0b",
        slate: {
          950: "#0b1221"
        }
      }
    }
  },
  plugins: []
};
