import next from "@gamehub/config/eslint/next";

// Vendored Stockfish build (GPL-3.0, minified): not ours to lint.
export default [...next, { ignores: ["next-env.d.ts", "server/bots/stockfish/**"] }];
