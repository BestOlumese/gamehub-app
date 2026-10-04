import base from "@gamehub/config/eslint/base";

export default [
  ...base,
  {
    // Engine is pure: randomness and time are injected through Ctx.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use ctx.rng." },
        { object: "Date", property: "now", message: "Use ctx.now." },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date']", message: "Use ctx.now." },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Engine has no I/O." },
        { name: "crypto", message: "Use ctx.rng." },
      ],
    },
  },
];
