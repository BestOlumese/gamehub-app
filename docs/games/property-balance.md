# Naija Plots balance report

Generated 2026-10-09 with `BALANCE=500 pnpm vitest run balance` in `packages/engine`: 500 classic games per player count (Medium bots, seeds `bal-<players>-<n>`), plus 500 games stopped at a 45-minute equivalent. Bands from `games/property.md` → "Tests and balance simulation". Rent formula: base 7.5 % × group factor (Clay ×4, Royal ×2), houses ×5 / 14 / 32 / 42, hotel ×52.

Group win rate = how often the player who completed that group first went on to win.

| Players | Band | Value | Pass |
|---|---|---|---|
| 2 | Classic median rounds (info) | 61.0 | yes |
| 2 | Winner ≤ 3 × median net worth after a 45-min game (58 turns) (info) | 100.0 % | yes |
| 2 | No group's win rate over 2 × another's | 1.14 | yes |
| 2 | First seat's win rate (fair: 50.0 %) (info) | 47.2 % | yes |
| 2 | Money in play after 30 rounds 0.5×–3× the start | 1.89× | yes |
| 2 | Cash after 15 / 30 rounds (info) | 0.20× / 0.14× | yes |
| 2 | Group win rates (games held) | clay 68.5 % (463), sky 62.6 % (439), coral 61.4 % (428), sunset 61.7 % (452), palm 59.9 % (434), gold 60.9 % (445), forest 61.5 % (431), royal 62.4 % (412) | |
| 4 | Classic median 30–60 rounds | 34.8 | yes |
| 4 | ≥ 95 % end by bankruptcy within 150 rounds | 99.6 % | yes |
| 4 | Winner ≤ 3 × median net worth after a 45-min game (72 turns) in ≥ 80 % | 94.2 % | yes |
| 4 | No group's win rate over 2 × another's | 1.53 | yes |
| 4 | First seat's win rate (fair: 25.0 %) (info) | 28.6 % | yes |
| 4 | Money in play after 30 rounds 0.5×–3× the start | 1.59× | yes |
| 4 | Cash after 15 / 30 rounds (info) | 0.41× / 0.29× | yes |
| 4 | Group win rates (games held) | clay 62.7 % (475), sky 63.2 % (456), coral 59.8 % (473), sunset 70.6 % (480), palm 60.0 % (472), gold 67.2 % (463), forest 66.7 % (466), royal 46.2 % (457) | |
| 6 | Classic median rounds (info) | 29.5 | yes |
| 6 | Winner ≤ 3 × median net worth after a 45-min game (86 turns) (info) | 84.8 % | yes |
| 6 | No group's win rate over 2 × another's | 1.66 | yes |
| 6 | First seat's win rate (fair: 16.7 %) (info) | 19.2 % | yes |
| 6 | Money in play after 30 rounds 0.5×–3× the start | 1.58× | yes |
| 6 | Cash after 15 / 30 rounds (info) | 0.59× / 0.56× | yes |
| 6 | Group win rates (games held) | clay 61.2 % (492), sky 75.4 % (488), coral 70.4 % (490), sunset 74.7 % (487), palm 70.2 % (493), gold 73.9 % (490), forest 73.2 % (492), royal 45.5 % (481) | |
| 8 | Classic median rounds (info) | 26.8 | yes |
| 8 | Winner ≤ 3 × median net worth after a 45-min game (100 turns) (info) | 69.7 % | yes |
| 8 | No group's win rate over 2 × another's | 1.69 | yes |
| 8 | First seat's win rate (fair: 12.5 %) (info) | 14.0 % | yes |
| 8 | Money in play after 30 rounds 0.5×–3× the start | 1.60× | yes |
| 8 | Cash after 15 / 30 rounds (info) | 0.72× / 0.70× | yes |
| 8 | Group win rates (games held) | clay 51.7 % (493), sky 76.9 % (490), coral 77.3 % (494), sunset 80.0 % (499), palm 75.5 % (494), gold 77.5 % (494), forest 79.6 % (495), royal 47.2 % (496) | |

## How we got here (Oct 2026)

1. First formula (7.5 %, houses ×4.5/12/28/36/44, no group factors), no bot trading: 2-player games never ended (scattered plots, no full groups); 4 players median 66 rounds.
2. Bots propose group-completing swaps and cash offers; houses ×5.5/15/35/45/55; two-plot groups ×1.5 → length OK, Clay still weak (2.3× gap).
3. Clay ×3 / Royal ×2 → 4 and 6 players pass; Clay weak with 8 players (2.4×).
4. Clay ×4, houses ×5/14/32/42/52 → all bands pass.

First-seat edge (≈ 29 % with 4 players) kept by Best's choice: rooms pick the first player at random by default.
