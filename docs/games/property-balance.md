# Naija Plots balance report

Generated 2026-10-10 with `BALANCE=500 pnpm vitest run balance` in `packages/engine`: 500 classic games per player count (Medium bots), plus 500 stopped at a 45-minute equivalent. Bands from `games/property.md`. Rents: base 7.5 % × group factor (Clay ×3, Royal ×1.5), houses ×5/14/32/42, hotel ×52. **House prices follow the rent they add** (1.3 landings' worth × group landing weight; Clay ×0.75, Royal ×0.7), floor = the old flat price.

Group win rate = how often the player who completed that group first went on to win.

| Players | Band | Value | Pass |
|---|---|---|---|
| 2 | Classic median rounds (info) | 92.0 | yes |
| 2 | Winner ≤ 3 × median net worth after a 45-min game (58 turns) (info) | 100.0 % | yes |
| 2 | No group's win rate over 2 × another's | 1.18 | yes |
| 2 | First seat's win rate (fair: 50.0 %) (info) | 43.4 % | yes |
| 2 | Money in play after 30 rounds 0.5×–3× the start | 1.92× | yes |
| 2 | Cash after 15 / 30 rounds (info) | 0.19× / 0.14× | yes |
| 2 | Group win rates (games held) | clay 62.0 % (489), sky 62.2 % (481), coral 54.5 % (481), sunset 64.1 % (485), palm 61.0 % (477), gold 64.2 % (483), forest 62.8 % (478), royal 58.8 % (471) | |
| 4 | Classic median 30–60 rounds | 54.5 | yes |
| 4 | ≥ 95 % end by bankruptcy within 150 rounds | 99.0 % | yes |
| 4 | Winner ≤ 3 × median net worth after a 45-min game (72 turns) in ≥ 80 % | 98.6 % | yes |
| 4 | No group's win rate over 2 × another's | 1.62 | yes |
| 4 | First seat's win rate (fair: 25.0 %) (info) | 32.0 % | yes |
| 4 | Money in play after 30 rounds 0.5×–3× the start | 1.65× | yes |
| 4 | Cash after 15 / 30 rounds (info) | 0.37× / 0.25× | yes |
| 4 | Group win rates (games held) | clay 54.7 % (494), sky 59.5 % (491), coral 61.8 % (495), sunset 62.8 % (494), palm 60.5 % (488), gold 64.1 % (490), forest 63.2 % (492), royal 39.7 % (494) | |
| 6 | Classic median rounds (info) | 43.7 | yes |
| 6 | Winner ≤ 3 × median net worth after a 45-min game (86 turns) (info) | 93.6 % | yes |
| 6 | No group's win rate over 2 × another's | 1.87 | yes |
| 6 | First seat's win rate (fair: 16.7 %) (info) | 20.4 % | yes |
| 6 | Money in play after 30 rounds 0.5×–3× the start | 1.63× | yes |
| 6 | Cash after 15 / 30 rounds (info) | 0.57× / 0.50× | yes |
| 6 | Group win rates (games held) | clay 54.6 % (500), sky 68.5 % (499), coral 67.3 % (498), sunset 72.6 % (497), palm 69.6 % (500), gold 73.7 % (498), forest 70.4 % (494), royal 39.4 % (495) | |
| 8 | Classic median rounds (info) | 38.4 | yes |
| 8 | Winner ≤ 3 × median net worth after a 45-min game (100 turns) (info) | 88.2 % | yes |
| 8 | No group's win rate over 2 × another's | 2.00 | yes |
| 8 | First seat's win rate (fair: 12.5 %) (info) | 14.0 % | yes |
| 8 | Money in play after 30 rounds 0.5×–3× the start | 1.62× | yes |
| 8 | Cash after 15 / 30 rounds (info) | 0.69× / 0.62× | yes |
| 8 | Group win rates (games held) | clay 41.2 % (500), sky 73.5 % (498), coral 76.1 % (498), sunset 82.2 % (500), palm 74.2 % (497), gold 81.0 % (499), forest 76.5 % (498), royal 47.8 % (500) | |

## History

**Oct 9 (first tuning).**
1. First formula, no bot trading: 2-player games never ended; 4 players median 66 rounds.
2. Bots propose group-completing trades; house rents raised; two-plot groups boosted.
3. Clay ×4, Royal ×2, flat house prices: all bands passed.

**Oct 10 (Best: building was too easy, Banana Island to a hotel at once then ₦4M a landing).**
4. House prices follow the rent they add (1.6 landings), Royal ×1.3: much better comebacks (winner ≤ 3× median in 99.5 % of 4-player games), but Royal too weak (33 %) and 4-player games too long (65 rounds).
5. Payback 1.4, Royal ×1.5: Royal still weak.
6. Royal houses ×0.7, payback 1.3: 4 and 6 players pass; Clay weak with 8 players.
7. Clay houses ×0.75: all bands pass (above).

First-seat edge kept as information (Best's choice): rooms pick the first player at random by default.
