# Research sources

Every external fact used in the new game and mode specs, grouped by topic. "Checked" is the date the page was read. Where sources disagree, the doc that uses the fact says so and explains the pick. Low-quality sources (aggregator blogs) are marked; prefer the primary source where one is listed.

## Platform limits

| URL | Used for | Checked |
|---|---|---|
| https://developers.cloudflare.com/workers/platform/limits/ | Workers Free CPU **10 ms** per request; 128 MB memory; 100k requests/day; 50 subrequests/request; Worker size **64 MiB uncompressed, no compressed limit**; "waiting on network does not count toward CPU time" | 2026-10-06 |
| https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/ | Size limit change on 4 Sep 2026: old 3 MB (Free) / 10 MB (Paid) compressed → 64 MiB uncompressed on all plans | 2026-10-06 |
| https://developers.cloudflare.com/durable-objects/platform/limits/ | DO "CPU per request 30 s (default)" footnote, 2 MB max row, 10 GB per object, 100 classes on Free. **Conflicts** with the Workers Free 10 ms figure — see `13-free-tier-budget.md` | 2026-10-06 |
| https://developers.cloudflare.com/durable-objects/reference/faq | "Durable Objects are Worker scripts, and have the same per invocation CPU limits as any Workers do"; CPU time excludes I/O waits | 2026-10-06 |
| https://developers.cloudflare.com/durable-objects/platform/pricing/ | Free: 100k requests/day, 13,000 GB-s/day, 5M rows read, 100k rows written, 5 GB; WebSocket messages billed 20:1; alarms count as requests; "Each setAlarm() is billed as a single row written" | 2026-10-06 |
| https://developers.cloudflare.com/changelog/2025-10-10-increased-startup-time/ | Worker startup (global scope) limit 1 s on all plans | 2026-10-06 |
| https://github.com/emdash-cms/emdash/issues/3858 | Field report: on Workers Free, cold-isolate start-up work counts against the first invocation's 10 ms (no Cloudflare statement) | 2026-10-06 |
| https://vercel.com/docs/plans/hobby | Hobby: 4 Active-CPU hours, 360 GB-hrs provisioned memory, 1M invocations per month; over a limit → wait 30 days; non-commercial only | 2026-10-06 |
| https://vercel.com/docs/functions/limitations | Hobby functions: 300 s max duration, 2 GB / 1 vCPU, 250 MB bundle, 4.5 MB body; full Node.js API | 2026-10-06 |
| https://vercel.com/docs/functions/usage-and-pricing | Active CPU counts only executing code, not I/O waits; provisioned memory billed for instance lifetime | 2026-10-06 |

## Chess

| URL | Used for | Checked |
|---|---|---|
| https://registry.npmjs.org/chess.js (npm registry API) | chess.js **1.4.0**, BSD-2-Clause, published 2025-06-14 | 2026-10-06 |
| https://unpkg.com/chess.js@1.4.0/README.md | API: `moves`, `move`, `fen`, `load`, `pgn`, `hash`, `isCheckmate`, `isStalemate`, `isInsufficientMaterial`, `isThreefoldRepetition`, `isDrawByFiftyMoves`, `isDraw` (counts 50 moves as automatic) | 2026-10-06 |
| https://unpkg.com/chess.js@1.4.0/dist/esm/chess.js | Zobrist keys come from a fixed-seed xoroshiro128** (no `Math.random`) → deterministic, fine inside the pure engine; ESM build ≈ 107 KB raw | 2026-10-06 |
| https://registry.npmjs.org/stockfish + https://unpkg.com/stockfish@19.0.0/?meta | npm `stockfish` **19.0.0** (2026-09-15), GPL-3.0; `stockfish-19-lite-single.js` 21 KB + `.wasm` 1.79 MB; full builds ≈ 99 MB | 2026-10-06 |
| https://unpkg.com/stockfish@19.0.0/README.md and index.js | Five flavours; "lite single-threaded" recommended; Node loader resolves `.wasm` next to the `.js` | 2026-10-06 |
| https://github.com/nmrugg/stockfish.js | Upstream repo now on Stockfish 19 (the older `nharan/stockfish.js` fork is Stockfish 17 with a ≈6 MB lite build) | 2026-10-06 |
| https://github.com/nharan/stockfish.js | Older fork referenced in the brief; superseded | 2026-10-06 |
| https://raw.githubusercontent.com/official-stockfish/Stockfish/master/src/engine.cpp and src/search.h | UCI options: `Skill Level` 0–20 (default 20), `UCI_LimitStrength`, `UCI_Elo` **1320–3190** ("CCRL Blitz"), `Threads`, `Hash`, `Move Overhead` | 2026-10-06 |
| https://www.npmjs.com/package/chessground | Chessground is GPL-3.0 → not used in the client | 2026-10-06 (from brief; npm page blocked automated fetch) |
| https://en.wikipedia.org/wiki/Draw_(chess) | FIDE draw types overview | 2026-10-06 (from brief) |
| https://raw.githubusercontent.com/lichess-org/scalachess/master/core/src/main/scala/LagTracker.scala | Lichess lag compensation: `comp = min(lag, quota)`, quota grows by `quotaGain` per move, starts at 3× and caps at 7× `quotaGain`; `quotaGain = min(1 s, 0.4 % of estimated game seconds + 0.15 s)` | 2026-10-06 |
| https://raw.githubusercontent.com/lichess-org/scalachess/master/core/src/main/scala/Clock.scala and MoveMetrics.scala | Lag = server elapsed − client-reported move time; flag check allows `min(quota, 2 s)` grace | 2026-10-06 |
| https://raw.githubusercontent.com/lichess-org/scalachess/master/core/src/main/scala/Speed.scala | Categories by estimated seconds (base + 40 × increment): UltraBullet < 30, Bullet 30–179, Blitz 180–479, Rapid 480–1499, Classical ≥ 1500 | 2026-10-06 |
| https://raw.githubusercontent.com/lichess-org/scalachess/master/core/src/main/scala/variant/Variant.scala | Lichess auto-draws on insufficient material, 50 moves (100 half-moves) and fivefold; threefold is a claim | 2026-10-06 |
| https://lichess.org/@/DaBassie/blog/scientific-analysis-of-lag-compensation-on-lichess-and-chess-dot-com/iXRCXoxd | Chess.com forgives at most 250 ms of lag in bullet; article itself has no lichess internals | 2026-10-06 |
| https://lichess.org/forum/lichess-feedback/lag-compensation-with-premoves (search result) | Lichess premoves cost no clock time; chess.com charges 0.1 s | 2026-10-06 (forum, secondary) |
| https://en.wikipedia.org/wiki/Premove | Premove behaviour on lichess vs chess.com | 2026-10-06 |
| https://support.chess.com/en/articles/8593801-how-does-game-abandonment-work | Chess.com auto-aborts if the first move isn't made in time (bullet 15 s, blitz 20 s, rapid 60 s — per search summary) | 2026-10-06 |
| https://lichess.org/forum/redirect/post/dvJDh1sW (search result) | Lichess "auto-claim threefold" preference: never / always / when < 30 s | 2026-10-06 (forum, secondary) |
| https://github.com/lichess-org/lila/blob/master/COPYING.md | Piece-set licences: cburnett/merida GPLv2+ (lichess copies), rhosgfx CC0, fantasy/spatial/celtic MIT, chessnut Apache-2.0, many CC BY-NC-SA | 2026-10-06 |
| https://commons.wikimedia.org/wiki/File:Chess_klt45.svg | Cburnett pieces on Wikimedia Commons: GFDL, CC BY-SA 3.0, **BSD 3-clause**, GPLv2+ (pick BSD) | 2026-10-06 |

## Draughts

| URL | Used for | Checked |
|---|---|---|
| https://fateround.com/games/checkers-nigeria | Nigerian draft: 10×10, 20 "seeds", men capture backward, flying kings, compulsory **majority** capture, promotion only at the end of a move, 25-move rule | 2026-10-06 |
| https://www.draftstechniques.com/p/intl-draughts-rules-nigerianghanaian.html | Nigerian/Ghanaian "mirrored" version: long diagonal on each player's **right**; men capture backward; flying kings; **free choice capture** ("the capture of the largest number of pieces is not obligatory"); first move by lot; crowning with a captured piece | 2026-10-06 |
| https://www.draftstechniques.com/2017/03/nigerian-draughts-rules-manuals.html | Same rules; FMJD version vs mirrored version | 2026-10-06 |
| https://www.draftstechniques.com/2016/09/international-draughts-rules-nigeria.html (search summary) | FMJD = majority capture; African mirrored version = free-choice capture | 2026-10-06 |
| https://leineutiti1987.wixsite.com/tingzofabbbal/post/nigerian-draft-game-the-history-and-rules-of-the-nigerian-style-draughts | Low-quality blog: "black moves first", men forward-only captures — contradicts the two sources above; not used except as evidence of variation | 2026-10-06 |
| https://apps.apple.com/app/id6453639217 | AfroDraught offers Nigerian, Ghana and International rule sets (no details) | 2026-10-06 |
| https://en.wikipedia.org/wiki/International_draughts | Light moves first; jumped pieces removed at end of turn; crown only when the move ends on the back row; threefold; 25-move king rule; 16-turn endgame rule; K v K draw | 2026-10-06 |
| https://www.worldmindgames.net/draughts/rules/ | FMJD orientation (dark square bottom-left), white first, majority capture, pass-through promotion | 2026-10-06 |
| https://lidraughts.org/variant/standard and https://playstrategy.org/variant/international (search summary) | FMJD endgame rule: 1 king v 3 pieces incl. a king → draw after 16 moves each; 1 king v ≤ 2 pieces incl. a king → draw after 5 moves each | 2026-10-06 |
| https://en.wikipedia.org/wiki/English_draughts | Dark moves first; free choice among captures; kings one square; man reaching the king row ends the move | 2026-10-06 |
| https://playstrategy.org/variant/english (search summary) | 40-move rule after a refused draw offer | 2026-10-06 |
| https://en.wikipedia.org/wiki/Tanzanian_draughts and search summary on Ghanaian "damii" | Ghana: free-choice capture, king forfeited for a missed capture, a lone piece loses (not adopted) | 2026-10-06 |

## Property game

| URL | Used for | Checked |
|---|---|---|
| https://www.howwemadeitinafrica.com/interview-the-company-behind-the-lagos-version-of-monopoly/ | Official Lagos edition by Bestman Games (Hasbro licensee), Christmas 2012; dearest: Banana Island, Ikoyi Crescent, Bourdillon Road; cheapest: Makoko | 2026-10-06 |
| https://www.americanbar.org/groups/intellectual_property_law/resources/landslide/archive/not-playing-around-board-games-intellectual-property-law/ | Board-game IP overview (page blocked automated fetch; content via search summary) | 2026-10-06 |
| https://copyrightalliance.org/copyrightability-of-board-games/ and https://webharvest.gov/peth04/20041015023438/http://www.copyright.gov/fls/fl108.html (US Copyright Office FL-108) | Game ideas/methods not protected; rule text and board/box art can be | 2026-10-06 |
| https://www.casalonga.com/jurisprudence/paris-court-of-appeal-hasbro-v-sogego.html and search summary | Hasbro won against "Ghettopoly" (2003) and "Tripotoly" (Paris) → avoid "-opoly" names and look-alikes | 2026-10-06 |
| https://en.wikipedia.org/wiki/Monopoly_(game) | Genre mechanics overview (not copied) | 2026-10-06 (from brief) |
| https://plotinsider.com/real-estate/wealthiest-real-estate-neighborhoods-in-nigeria/ | 2026 ranking of 20 wealthiest neighbourhoods (Banana Island, Maitama, Eko Atlantic, Asokoro, Old Ikoyi, Guzape, VI, Parkview, Old GRA PH, … Independence Layout, Bodija) | 2026-10-06 |
| https://www.legit.ng/business-economy/economy/1731766-nigerias-expensive-neighbourhoods-how-costs-a-home-there/ | Corroborates top Lagos/Abuja areas | 2026-10-06 |
| https://businessday.ng/real-estate/article/herere-lagos-suburbs-where-renters-can-find-affordable-rents/ (search summary) | Affordable Lagos areas: Ojo, Ikorodu, Agege, Ikotun, Abule Egba … | 2026-10-06 |
| https://ownkey.com/ng/blog/living-in-ibadan and https://nigerianqueries.com/best-areas-to-live-in-ibadan-full-list/ (search summary) | Ibadan: Bodija, Jericho, Iyaganku GRA upscale; Akobo, Challenge, Apata affordable | 2026-10-06 |
| https://blog.naijaspider.com/2025/04/29/the-most-expensive-areas-to-live-in-port-harcourt | Port Harcourt: Old GRA, New GRA dear; Woji, Eliozu mid | 2026-10-06 |
| https://proshare.co/articles/nigerias-wealthiest-neighbourhoods (search summary) | Kano Nassarawa GRA; Enugu Independence Layout, GRA | 2026-10-06 |
| https://arxiv.org/pdf/1410.1107, https://web.williams.edu/Mathematics/sjmiller/public_html/hudson/Li_Markov%20Chains%20in%20the%20Game%20of%20Monopoly.pdf, https://www.insidehook.com/culture/scientific-proof-of-how-to-win-at-monopoly/amp (search summaries) | Markov-chain landing frequencies (jail most visited; group after jail most landed), 3-house ROI, late-game "stay in jail" | 2026-10-06 |
| Name clash searches: "C of O", "Landlord Naija", "Area Boss", "Plot Hustle", "Estate Kings", "Naija Plots" (web search, no exact game found except "Landlord" titles: Landlord Go / Landlord Tycoon by Reality Games) | Name proposals | 2026-10-06 |

## Football Draft

| URL | Used for | Checked |
|---|---|---|
| https://supercoinsy.com/article/ea-fc-26-game-mode-explained-draft | FC 26 Draft for inspiration only: formation 1 of 5, captain 1 of 5, each of 23 spots 1 of 5, four matches, one loss ends the run (aggregator, medium quality) | 2026-10-06 |
| https://www.fifplay.com/fc-27-player-roles/ | FC 27 roles for inspiration only (37 roles; Role+ / Role++) — **not copied** | 2026-10-06 |
| https://fifauteam.com/fc-26-squad-rating-guide/ | Squad rating is an average with a correction factor; real top clubs ≈ 80–84 in FC 26 (aggregator) | 2026-10-06 |
| https://www.premierleague.com/en/news/4316617 and https://theanalyst.com/2024/11/premier-league-2024-25-data-trends-stats (search summary) | PL 2024/25: ≈ 2.93–2.97 goals per game; 26.1 shots per 90 (both teams) | 2026-10-06 |
| https://theanalyst.com/2024/10/premier-league-draws and search summary | PL 2024/25 full season: home 40.8 %, draw 24.5 %, away 34.7 % | 2026-10-06 |
| https://www.sportytrader.com/us/news/stats-across-top-european-leagues-and-mls-2024-2025/ | 2024/25 goals per game: Bundesliga 3.14, Ligue 1 2.96, PL 2.93, La Liga 2.62, Serie A 2.56 | 2026-10-06 |
| https://penaltyblog.readthedocs.io/en/latest/models/overview.html, https://statsultra.com/dixon-coles-model/, https://arxiv.org/pdf/2001.09097 | Poisson / Dixon–Coles goal models; low-score correction; match-statistics forecasting | 2026-10-06 |
| https://www.loeb.com/en/insights/publications/2007/10/cbc-distribution--marketing-inc-v-major-league-b__ | *C.B.C. Distribution v. MLB Advanced Media* (8th Cir. 2007): names + statistics in fantasy games protected by the First Amendment over publicity rights | 2026-10-06 |
| https://www.thegamer.com/ea-fifa-lawsuit-ibrahimovic-bale/ | Ibrahimović/Bale and ~300 players disputing EA's likeness use (2020) | 2026-10-06 |
| https://www.pressetext.com/news/na-20030429052.html | Oliver Kahn won against EA in Germany (2003) over likeness | 2026-10-06 |
| https://www.fifpro.org/en/articles/2025/08/fifpro-europe-reaction-to-class-action-announced-by-dutch-foundation-justice-for-players | Ongoing player-rights litigation climate in the EU (about FIFA rules, not games) | 2026-10-06 |
| https://github.com/dcaribou/transfermarkt-datasets | CC0 code and data, scraped from Transfermarkt; **updates paused, current to 6 July 2026** | 2026-10-06 |
| https://www.vanguardngr.com/2026/09/full-list-osimhen-makes-super-eagles-24-man-squad-for-afcon-qualifiers/ | Super Eagles AFCON 2027 qualifier squad (Sept 2026) | 2026-10-06 |
| https://www.pulsesports.ng/story/nigeria-super-eagles-squad-list-russia-friendly-eric-chelle-2026091718533294842 and https://soccernet.ng/2026/10/super-eagles-npfl-stars-nigeria-russia.html | Experimental squad for the 6 Oct 2026 Russia friendly (NPFL call-ups) | 2026-10-06 |
| https://en.wikipedia.org/wiki/2025%E2%80%9326_Nigeria_Premier_Football_League | 2025/26 NPFL: Enugu Rangers champions; joint top scorers Obaje (Rangers), Mbaoma (Remo Stars), Mairiga (Wikki Tourists), 14 goals | 2026-10-06 |
| https://soccernet.ng/2026/07/victor-osimhen-medical-galatasaray.html | Osimhen at Galatasaray for 2026/27 | 2026-10-06 |
| https://gazettengr.com/atletico-madrid-confirm-signing-of-ademola-lookman-from-atalanta/ | Lookman to Atlético Madrid, July 2026 | 2026-10-06 |
| https://soccernet.ng/2026/08/fulham-bassey-iwobi-chelsea.html and https://www.afrik-foot.com/en-ng/nigeria-premier-league-iwobi-fulham-forest | Iwobi, Bassey (Fulham), Aina (Nottingham Forest) for 2026/27 | 2026-10-06 |
| https://www.channelstv.com/2026/07/12/super-eagles-goalkeeper-nwabali-returns-to-chippa-united-five-months-after-exit/ | Nwabali back at Chippa United (July 2026) | 2026-10-06 |
| https://foot-africa.com/en/news/official-frankfurt-signs-raphael-onyedika-from-club-brugge-1302082/ | Onyedika to Eintracht Frankfurt (Aug 2026) | 2026-10-06 |
| https://panafricafootball.com/article/samuel-chukwueze-to-remain-at-ac-milan | Chukwueze stays at AC Milan for 2026/27 | 2026-10-06 |
| https://blog.jingtea.com/harry-kane-kg5g.html (low quality), https://www.nbcsports.com/soccer/news/when-does-erling-haaland-play-next-2026-27-man-city-schedule-opening-matches-for-premier-league-season, https://en.wikipedia.org/wiki/Lamine_Yamal, https://cryptobriefing.com/premier-league-first-game-without-salah/ (low quality) | Kane (Bayern), Haaland (Man City), Yamal (Barcelona) for 2026/27; Salah left Liverpool (announced March 2026, club unverified) | 2026-10-06 |

## Tournaments

| URL | Used for | Checked |
|---|---|---|
| https://help.start.gg/en/articles/13813572-elimination-brackets-and-free-for-all-setup | Free-for-all brackets: max players per group, progressions per group, snake seeding; no phases/waves | 2026-10-06 |
| https://forum.boardgamearena.com/viewtopic.php?p=104884 | BGA multiplayer elimination problems: random elimination after a timeout, unfair byes, a final table of 1 advancer + 3 bye players | 2026-10-06 |

## Whot decking (Oct 2026)
- Wikipedia, "Whot!" (double decking): https://en.wikipedia.org/wiki/Whot!
- Pagat, "Whot!": https://www.pagat.com/com/whot.html
- WhotGuide, "Whot Rules": https://www.whotguide.com/rules/whot-rules
- Wikipedia, "Mau-Mau (card game)" (Prší, Faraón multi-card play): https://en.wikipedia.org/wiki/Mau-Mau_(card_game)
- Pagat, "Crazy Eights": https://pagat.com/eights/crazy8s.html
