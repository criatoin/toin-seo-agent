import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        toin: {
          yellow: '#FFC533',
          purple: '#6010C6',
          'purple-dark': '#4a0d99',
          'purple-light': '#7a1ff0',
        },
      },
    },
  },
  plugins: [],
};
export default config;
