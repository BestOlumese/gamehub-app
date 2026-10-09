# Stockfish 19 (lite, single-threaded) — server only

From the `stockfish` npm package **19.0.0** (Stockfish.js by Nathan Rugg / Chess.com, built from
Stockfish by the Stockfish developers): `bin/stockfish-19-lite-single.js` (renamed `.cjs`: it is CommonJS and this package is ESM) and
`.wasm`, otherwise unchanged.

Licence: **GPL-3.0** (see `Copying.txt`). These files run only inside our bot route on our own
server; they are never sent to browsers (CI checks that `.next/static` contains no "stockfish").
Credited on `/legal/credits`. See `docs/15-bot-service.md`.
