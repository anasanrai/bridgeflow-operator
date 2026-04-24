import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        bg: "#0a0a0b",
        surface: "#111111",
        "surface-2": "#161616",
        border: "#1a1a1a",
        "border-strong": "#222222",
        ink: "#f5f5f5",
        "ink-muted": "#a1a1a6",
        muted: "#8a8c94",
        faint: "#555555",
        accent: "#00d4aa",
        "accent-dim": "#00a884",
        hot: "#ef4444",
        warm: "#f59e0b",
        cold: "#3b82f6",
      },
      boxShadow: {
        "glow-hot": "0 0 24px -4px rgba(239,68,68,0.55), 0 0 4px rgba(239,68,68,0.5)",
        "glow-warm": "0 0 24px -4px rgba(245,158,11,0.5), 0 0 4px rgba(245,158,11,0.4)",
        "glow-cold": "0 0 24px -4px rgba(59,130,246,0.5), 0 0 4px rgba(59,130,246,0.4)",
        "glow-accent": "0 0 24px -4px rgba(0,212,170,0.45), 0 0 2px rgba(0,212,170,0.35)",
        "inset-hair": "inset 0 1px 0 0 rgba(255,255,255,0.04)",
      },
      keyframes: {
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        hotPop: {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "60%": { transform: "scale(1.03)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        hotGlow: {
          "0%, 100%": { boxShadow: "0 0 24px -4px rgba(239,68,68,0.45)" },
          "50%": { boxShadow: "0 0 32px 0px rgba(239,68,68,0.65)" },
        },
        caret: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        blink: "pulse 1.1s ease-in-out infinite",
        caret: "caret 1s steps(1) infinite",
        "hot-pop": "hotPop 0.55s cubic-bezier(0.22, 1, 0.36, 1) 1",
        "hot-glow": "hotGlow 2.4s ease-in-out infinite",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        "fade-in-up": "fadeInUp 0.35s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
