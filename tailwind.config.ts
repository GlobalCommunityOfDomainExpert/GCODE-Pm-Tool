import type { Config } from "tailwindcss";

// Tokens mirror docs/design_theme.md and wireframe/css/main.css exactly.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#6366f1", hover: "#4f46e5", active: "#4338ca" },
        app: "#f8fafc",
        surface: "#ffffff",
        border: "#e2e8f0",
        "text-primary": "#0f172a",
        "text-secondary": "#64748b",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#3b82f6",
      },
      fontFamily: {
        // --font-inter is set by next/font/google in src/app/layout.tsx.
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: { sm: "6px", md: "8px", lg: "12px" },
      boxShadow: {
        card: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)",
        xl: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
      },
      spacing: {
        sidebar: "240px",
        "sidebar-collapsed": "64px",
        header: "64px",
      },
      maxWidth: { content: "1440px" },
    },
  },
  plugins: [],
};

export default config;
