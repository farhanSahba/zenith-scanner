import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // لوحة الألوان النيون (داكنة بالكامل مثل شاشات التداول)
        base: {
          900: "#05070a", // أغمق خلفية
          850: "#080b10",
          800: "#0b0f15", // خلفية اللوحات
          750: "#10151d",
          700: "#161c26", // حدود/صفوف
          600: "#1e2632",
        },
        neon: {
          green: "#1cff9b",   // أخضر نيون (الأعلى احتمالاً)
          lime: "#39ff14",
          red: "#ff2d55",
          amber: "#ffb020",
          cyan: "#22d3ee",
          blue: "#3b82f6",
          purple: "#a855f7",
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "neon-green": "0 0 8px rgba(28,255,155,0.55)",
        "neon-red": "0 0 8px rgba(255,45,85,0.5)",
      },
      keyframes: {
        flash: {
          "0%": { backgroundColor: "rgba(28,255,155,0.35)" },
          "100%": { backgroundColor: "transparent" },
        },
        flashRed: {
          "0%": { backgroundColor: "rgba(255,45,85,0.35)" },
          "100%": { backgroundColor: "transparent" },
        },
        pulseDot: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
      },
      animation: {
        flash: "flash 0.9s ease-out",
        flashRed: "flashRed 0.9s ease-out",
        pulseDot: "pulseDot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
