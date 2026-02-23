import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          400: "#a78bfa",
          500: "#7c3aed",
          600: "#6d28d9",
        },
        surface: {
          700: "#2d1f5e",
          800: "#1a1035",
          900: "#0f0a1e",
        },
      },
    },
  },
  plugins: [],
};

export default config;
