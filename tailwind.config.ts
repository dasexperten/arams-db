import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dce8ff",
          500: "#3d6df5",
          600: "#2f57d1",
          700: "#2746a8",
        },
      },
    },
  },
  plugins: [],
};

export default config;
