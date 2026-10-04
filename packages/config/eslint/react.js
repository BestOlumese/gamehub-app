import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import base from "./base.js";

/** Flat config for React packages. */
export default [
  ...base,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
];
