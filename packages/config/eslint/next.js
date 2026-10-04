import nextPlugin from "@next/eslint-plugin-next";
import react from "./react.js";

/** Flat config for the Next.js app. */
export default [
  ...react,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];
