/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1724",
        muted: "#4b5563",
        mutedWeak: "#556071",
        surface: "#ffffff",
        canvas: "#f6f7f9",
        section: "#fbfbfd",
        accent: "#2f4fbf",
        accentSoft: "rgba(47,79,191,0.15)",
      },
      boxShadow: {
        card: "0 8px 20px rgba(15,23,36,0.05)",
        cardSoft: "0 4px 12px rgba(15,23,36,0.035)",
        cardSubtle: "0 2px 8px rgba(15,23,36,0.04)",
      },
      borderRadius: {
        xl: "12px",
      },
    },
  },
  plugins: [],
};
