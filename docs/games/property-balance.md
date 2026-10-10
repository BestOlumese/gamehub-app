# Naija Plots balance report

Generated 2026-10-10 with `BALANCE=500 pnpm vitest run balance` in `packages/engine`: 500 classic games per player count (Medium bots), plus 500 stopped at a 45-minute equivalent. Bands from `games/property.md`. Rents: base 7.5 % × group factor (Clay ×3, Royal ×1.5), houses ×5/14/32/42, hotel ×52. **House prices follow the rent they add** (1.3 landings' worth × group landing weight; Clay ×0.6, Royal ×0.7), floor = the old flat price, and each level at least 10 % dearer than the one before.

Group win rate = how often the player who completed that group first went on to win.

| Players | Band | Value | Pass |
|---|---|---|---|
| 2 | Classic median rounds (info) | 90.5 | yes |
| 2 | Winner ≤ 3 × median net worth after a 45-min game (58 turns) (info) | 100.0 % | yes |
| 2 | No group's win rate over 2 × another's | 1.18 | yes |
| 2 | First seat's win rate (fair: 50.0 %) (info) | 46.0 % | yes |
| 2 | Money in play after 30 rounds 0.5×–3× the start | 1.92× | yes |
| 2 | Cash after 15 / 30 rounds (info) | 0.18× / 0.14× | yes |
| 2 | Group win rates (games held) | clay 66.1 % (490), sky 60.8 % (480), coral 55.8 % (480), sunset 60.8 % (487), palm 57.6 % (479), gold 61.0 % (479), forest 63.6 % (483), royal 58.1 % (463) | |
| 4 | Classic median 30–60 rounds | 56.0 | yes |
| 4 | ≥ 95 % end by bankruptcy within 150 rounds | 98.4 % | yes |
| 4 | Winner ≤ 3 × median net worth after a 45-min game (72 turns) in ≥ 80 % | 98.4 % | yes |
| 4 | No group's win rate over 2 × another's | 1.70 | yes |
| 4 | First seat's win rate (fair: 25.0 %) (info) | 31.4 % | yes |
| 4 | Money in play after 30 rounds 0.5×–3× the start | 1.65× | yes |
| 4 | Cash after 15 / 30 rounds (info) | 0.36× / 0.23× | yes |
| 4 | Group win rates (games held) | clay 58.2 % (495), sky 59.0 % (493), coral 63.1 % (498), sunset 64.9 % (498), palm 60.4 % (493), gold 61.4 % (490), forest 64.0 % (491), royal 38.2 % (498) | |
| 6 | Classic median rounds (info) | 46.7 | yes |
| 6 | Winner ≤ 3 × median net worth after a 45-min game (86 turns) (info) | 94.2 % | yes |
| 6 | No group's win rate over 2 × another's | 1.83 | yes |
| 6 | First seat's win rate (fair: 16.7 %) (info) | 20.2 % | yes |
| 6 | Money in play after 30 rounds 0.5×–3× the start | 1.63× | yes |
| 6 | Cash after 15 / 30 rounds (info) | 0.56× / 0.43× | yes |
| 6 | Group win rates (games held) | clay 56.2 % (500), sky 65.8 % (500), coral 66.9 % (496), sunset 68.5 % (499), palm 69.0 % (494), gold 72.5 % (494), forest 72.8 % (496), royal 39.8 % (495) | |
| 8 | Classic median rounds (info) | 41.5 | yes |
| 8 | Winner ≤ 3 × median net worth after a 45-min game (100 turns) (info) | 88.8 % | yes |
| 8 | No group's win rate over 2 × another's | 1.77 | yes |
| 8 | First seat's win rate (fair: 12.5 %) (info) | 14.4 % | yes |
| 8 | Money in play after 30 rounds 0.5×–3× the start | 1.61× | yes |
| 8 | Cash after 15 / 30 rounds (info) | 0.68× / 0.53× | yes |
| 8 | Group win rates (games held) | clay 44.6 % (500), sky 72.7 % (498), coral 74.1 % (499), sunset 77.9 % (497), palm 74.1 % (499), gold 79.0 % (496), forest 73.0 % (496), royal 44.8 % (500) | |

## History

**Oct 9 (first tuning).**
1. First formula, no bot trading: 2-player games never ended; 4 players median 66 rounds.
2. Bots propose group-completing trades; house rents raised; two-plot groups boosted.
3. Clay ×4, Royal ×2, flat house prices: all bands passed.

**Oct 10 (Best: building was too easy, Banana Island to a hotel at once then ₦4M a landing).**
4. House prices follow the rent they add (1.6 landings), Royal ×1.3: much better comebacks (winner ≤ 3× median in 99.5 % of 4-player games), but Royal too weak (33 %) and 4-player games too long (65 rounds).
5. Payback 1.4, Royal ×1.5: Royal still weak.
6. Royal houses ×0.7, payback 1.3: 4 and 6 players pass; Clay weak with 8 players.
7. Clay houses ×0.75: all bands pass.

**Oct 10 (Best: the 4th house and the hotel cost the same, and less than the 3rd).** The 3rd house adds the biggest rent jump, so its payback price was the highest.
8. Each level at least 10 % dearer than the one before (Banana Island to a hotel ₦2.19M → ₦3.11M): 8 players fail (Clay weak, 2.08). A 5 % step: still 2.05.
9. 10 % step and Clay houses ×0.6: all bands pass (above).

First-seat edge kept as information (Best's choice): rooms pick the first player at random by default.
