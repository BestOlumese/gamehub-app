# Property-trading game (slug `property`)

Players: 2–8. Buy neighbourhoods across Nigeria, build houses and hotels, collect rent, trade, auction. **Our own name, board, prices, rents and card texts** — nothing is copied from Monopoly or its official Lagos edition. Unranked.

Sources: `docs/research/sources.md` → "Property game".

## Name — 5 proposals for Best (slug stays `property` until chosen)

| Name | Meaning / feel | Clash check (web search, Oct 2026) |
|---|---|---|
| **C of O** | "Certificate of Occupancy" — the document every Nigerian landowner wants. Short, local, a little bit of a joke. | No game found with this name. |
| **Area Boss** | Own the area, run the area. Playful street tone. | No game found ("Overboss", "Battle Bosses" exist — different words). |
| **Plot Hustle** | Buying plots, the hustle of building. | No game found. |
| **Estate Kings** | Clear, aspirational. | No game found ("Hustle Kings" is a registered billiards game — different). |
| **Naija Plots** | Plain and descriptive. | No game found. |

Rejected: anything ending in "-opoly" (Hasbro won against "Ghettopoly" and "Tripotoly"), "Landlord …" (Landlord Go / Landlord Tycoon by Reality Games, and the 1904 "Landlord's Game"). These were simple web searches, not a trademark search — ⚠️ do a proper search (NG trademarks registry + WIPO Global Brand Database) before any promotion (`concerns.md`).

## Legal guard-rails
- Game **mechanics** (dice, buying, rent, building, auctions, trading) are not protected by copyright (US Copyright Office FL-108: "the idea for a game … and the method or methods for playing it" are not protected). **Expression** is: rule text, board art, card text, box art. The **Monopoly** name, logo, board look (trade dress), mascot and card names are Hasbro's.
- Hasbro (through licensee **Bestman Games**) already sells an official **Lagos edition** (2012; dearest spaces Banana Island, Ikoyi Crescent, Bourdillon Road; cheapest Makoko). We don't copy its board: our board is **Naija-wide** (6 cities), our order and groups differ, and our top pair is Maitama + Banana Island.
- **We do not reuse Monopoly's price/rent tables, card texts, corner names, token designs, colour-group names or "Go/Jail/Free Parking/Chance/Community Chest" wording.** Our economy is generated from our own formula (below) and tuned by simulation.
- Visual design: round-cornered tiles, our palette, no red Monopoly banner, no top-hat-style tokens, no "Mr. Monopoly"-like character.
- Humour is welcome; **nothing insulting** to any ethnic group, religion, city, community or real company. No real brand names. No area is called "slum", "ghetto" or "poor" — groups go from "starter" to "top-end" by price only, and Makoko is not on the board.
- Recorded in `concerns.md`.

## Money
- Currency **Naira (₦)**, shown in thousands: **₦80k**, **₦1.2M** above a million. Internally integers in **₦1,000 units** (no floats).
- Start cash **₦2M** (2,000k). Salary for passing **Payday**: **₦300k**.

## The board (40 spaces)

Corners: **Payday** (0), **Police Post** (10, "just passing" unless detained), **Owambe** (20, rest; house-rule jackpot lives here), **Checkpoint** (30, "Checkpoint! Go to the Police Post").

| # | Space | Type |
|---|---|---|
| 0 | **Payday** — collect ₦300k when you pass or land | corner |
| 1 | Ojo (Lagos) | Clay |
| 2 | **Area Levy** — pay ₦200k | tax |
| 3 | Challenge (Ibadan) | Clay |
| 4 | **Danfo Park** | transport |
| 5 | **Gist** card | card |
| 6 | Ikorodu (Lagos) | Sky |
| 7 | Kubwa (Abuja) | Sky |
| 8 | **Hustle** card | card |
| 9 | Apata (Ibadan) | Sky |
| 10 | **Police Post** (just passing / detained) | corner |
| 11 | Yaba (Lagos) | Coral |
| 12 | Woji (Port Harcourt) | Coral |
| 13 | **Power Supply** | utility |
| 14 | **BRT Terminal** | transport |
| 15 | Trans-Ekulu (Enugu) | Coral |
| 16 | Surulere (Lagos) | Sunset |
| 17 | **Gist** card | card |
| 18 | Gwarinpa (Abuja) | Sunset |
| 19 | Sabon Gari (Kano) | Sunset |
| 20 | **Owambe** (rest) | corner |
| 21 | Gbagada (Lagos) | Palm |
| 22 | **Hustle** card | card |
| 23 | Bodija (Ibadan) | Palm |
| 24 | **Rail Station** | transport |
| 25 | New GRA (Port Harcourt) | Palm |
| 26 | Magodo GRA (Lagos) | Gold |
| 27 | **Water Board** | utility |
| 28 | Independence Layout (Enugu) | Gold |
| 29 | Nassarawa GRA (Kano) | Gold |
| 30 | **Checkpoint** — go to the Police Post | corner |
| 31 | Lekki Phase 1 (Lagos) | Forest |
| 32 | Old GRA (Port Harcourt) | Forest |
| 33 | **Gist** card | card |
| 34 | **Airport** | transport |
| 35 | Wuse II (Abuja) | Forest |
| 36 | **Diesel Money** — pay ₦120k | tax |
| 37 | Maitama (Abuja) | Royal |
| 38 | **Hustle** card | card |
| 39 | Banana Island (Lagos) | Royal |

City spread: Lagos 8, Abuja 4, Port Harcourt 3, Ibadan 3, Enugu 2, Kano 2. Order follows 2025–26 price research (affordable outskirts → mid-city → GRAs → the two most expensive districts in the country), not anyone's board.

### Colour groups
| Group | Colour (design token) | Spaces | Build cost |
|---|---|---|---|
| Clay | `#A0674B` | 1, 3 | ₦60k |
| Sky | `#5BB5E0` | 6, 7, 9 | ₦60k |
| Coral | `#E4717A` | 11, 12, 15 | ₦110k |
| Sunset | `#EE8A2B` | 16, 18, 19 | ₦110k |
| Palm | `#3E9B5F` | 21, 23, 25 | ₦160k |
| Gold | `#D9A520` | 26, 28, 29 | ₦160k |
| Forest | `#1F6F4A` | 31, 32, 35 | ₦210k |
| Royal | `#3B4BA8` | 37, 39 | ₦210k |

### Prices and rents (₦, generated)
Formula (ours): **rent = round(7.5 % of price)** (min ₦6k); full group unbuilt **× 2**; houses **× 4.5, 12, 28, 36**; hotel **× 44**, building rents rounded to ₦5k. Mortgage value = **50 %** of price. These are starting values: the balance simulation (below) may tune the multipliers before launch, and the table must be regenerated from the formula, never hand-copied from another game.

| Group | Space | Area (city) | Price | Rent | Group rent | 1 house | 2 | 3 | 4 | Hotel | Build | Mortgage |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Clay | 1 | Ojo (Lagos) | ₦80k | ₦6k | ₦12k | ₦25k | ₦70k | ₦170k | ₦215k | ₦265k | ₦60k | ₦40k |
| Clay | 3 | Challenge (Ibadan) | ₦90k | ₦7k | ₦14k | ₦30k | ₦85k | ₦195k | ₦250k | ₦310k | ₦60k | ₦45k |
| Sky | 6 | Ikorodu (Lagos) | ₦120k | ₦9k | ₦18k | ₦40k | ₦110k | ₦250k | ₦325k | ₦395k | ₦60k | ₦60k |
| Sky | 7 | Kubwa (Abuja) | ₦130k | ₦10k | ₦20k | ₦45k | ₦120k | ₦280k | ₦360k | ₦440k | ₦60k | ₦65k |
| Sky | 9 | Apata (Ibadan) | ₦150k | ₦11k | ₦22k | ₦50k | ₦130k | ₦310k | ₦395k | ₦485k | ₦60k | ₦75k |
| Coral | 11 | Yaba (Lagos) | ₦170k | ₦13k | ₦26k | ₦60k | ₦155k | ₦365k | ₦470k | ₦570k | ₦110k | ₦85k |
| Coral | 12 | Woji (Port Harcourt) | ₦180k | ₦14k | ₦28k | ₦65k | ₦170k | ₦390k | ₦505k | ₦615k | ₦110k | ₦90k |
| Coral | 15 | Trans-Ekulu (Enugu) | ₦200k | ₦15k | ₦30k | ₦70k | ₦180k | ₦420k | ₦540k | ₦660k | ₦110k | ₦100k |
| Sunset | 16 | Surulere (Lagos) | ₦220k | ₦16k | ₦32k | ₦70k | ₦190k | ₦450k | ₦575k | ₦705k | ₦110k | ₦110k |
| Sunset | 18 | Gwarinpa (Abuja) | ₦230k | ₦17k | ₦34k | ₦75k | ₦205k | ₦475k | ₦610k | ₦750k | ₦110k | ₦115k |
| Sunset | 19 | Sabon Gari (Kano) | ₦250k | ₦19k | ₦38k | ₦85k | ₦230k | ₦530k | ₦685k | ₦835k | ₦110k | ₦125k |
| Palm | 21 | Gbagada (Lagos) | ₦270k | ₦20k | ₦40k | ₦90k | ₦240k | ₦560k | ₦720k | ₦880k | ₦160k | ₦135k |
| Palm | 23 | Bodija (Ibadan) | ₦280k | ₦21k | ₦42k | ₦95k | ₦250k | ₦590k | ₦755k | ₦925k | ₦160k | ₦140k |
| Palm | 25 | New GRA (Port Harcourt) | ₦300k | ₦22k | ₦44k | ₦100k | ₦265k | ₦615k | ₦790k | ₦970k | ₦160k | ₦150k |
| Gold | 26 | Magodo GRA (Lagos) | ₦320k | ₦24k | ₦48k | ₦110k | ₦290k | ₦670k | ₦865k | ₦1,055k | ₦160k | ₦160k |
| Gold | 28 | Independence Layout (Enugu) | ₦330k | ₦25k | ₦50k | ₦110k | ₦300k | ₦700k | ₦900k | ₦1,100k | ₦160k | ₦165k |
| Gold | 29 | Nassarawa GRA (Kano) | ₦350k | ₦26k | ₦52k | ₦115k | ₦310k | ₦730k | ₦935k | ₦1,145k | ₦160k | ₦175k |
| Forest | 31 | Lekki Phase 1 (Lagos) | ₦380k | ₦28k | ₦56k | ₦125k | ₦335k | ₦785k | ₦1,010k | ₦1,230k | ₦210k | ₦190k |
| Forest | 32 | Old GRA (Port Harcourt) | ₦390k | ₦29k | ₦58k | ₦130k | ₦350k | ₦810k | ₦1,045k | ₦1,275k | ₦210k | ₦195k |
| Forest | 35 | Wuse II (Abuja) | ₦420k | ₦32k | ₦64k | ₦145k | ₦385k | ₦895k | ₦1,150k | ₦1,410k | ₦210k | ₦210k |
| Royal | 37 | Maitama (Abuja) | ₦470k | ₦35k | ₦70k | ₦160k | ₦420k | ₦980k | ₦1,260k | ₦1,540k | ₦210k | ₦235k |
| Royal | 39 | Banana Island (Lagos) | ₦520k | ₦39k | ₦78k | ₦175k | ₦470k | ₦1,090k | ₦1,405k | ₦1,715k | ₦210k | ₦260k |

A hotel costs one more build payment and returns the 4 houses to the bank.

### Transport (4) and utilities (2)
| Space | Price | Rent |
|---|---|---|
| Danfo Park, BRT Terminal, Rail Station, Airport | ₦220k each | owner has 1: ₦30k · 2: ₦60k · 3: ₦120k · 4: ₦240k |
| Power Supply, Water Board | ₦170k each | one owned: dice total × ₦5k · both: dice total × ₦12k |

Mortgage value 50 % of price for these too. Transport/utilities can't be built on.

## Card decks (original text)

Two decks of 16, shuffled with the room's seeded RNG at setup; drawn cards go to the bottom (except a kept Bail card, which returns when used). Deck order is **hidden** (never in any view).

### Gist (news and events)
1. Your cousin's wedding: you're the MC. Collect **₦100k** in sprayed money.
2. Traffic on the bridge. **Move back 3 spaces.**
3. **Advance to Payday.** Collect your salary.
4. Your phone screen cracked again. **Pay ₦40k.**
5. **Advance to the nearest transport space.** If someone owns it, pay them **double** the rent. If nobody does, you may buy it.
6. You booked a cheap flight. **Advance to the Airport.** Collect salary if you pass Payday.
7. Generator spoilt again. Repairs: **pay ₦25k per house and ₦100k per hotel** you own.
8. Your song is playing at every party. **Collect ₦150k.**
9. Checkpoint! **Go straight to the Police Post.** Don't pass Payday, no salary.
10. **Bail card.** Leave the Police Post free. Keep it until you need it, or trade it.
11. Business meeting in Abuja. **Advance to Wuse II.** Collect salary if you pass Payday.
12. Tech job interview. **Advance to Yaba.** Collect salary if you pass Payday.
13. You've been made chairman of your estate. **Pay each player ₦50k** for the meeting refreshments.
14. Your side hustle finally paid. **Collect ₦80k.**
15. **Advance to the nearest utility.** If someone owns it, roll the dice and pay them **₦15k × the roll**.
16. Light went off in the middle of the match. **Pay ₦20k** for fuel.

### Hustle (personal life)
1. Salary came early. **Advance to Payday.**
2. School fees for your younger sibling. **Pay ₦100k.**
3. Your POS stand had a great week. **Collect ₦120k.**
4. Owambe season! Every player buys your aso-ebi. **Collect ₦30k from each player.**
5. Hospital bill. **Pay ₦60k.**
6. **Bail card.** Leave the Police Post free. Keep it until you need it, or trade it.
7. You overpaid your electricity bill. Refund: **collect ₦50k.**
8. Agent fee for your new flat. **Pay ₦90k.**
9. Second place in the area football tournament. **Collect ₦60k.**
10. Wrong turn into a one-way street. **Go straight to the Police Post.** Don't pass Payday, no salary.
11. Your uncle in the village left you something. **Collect ₦200k.**
12. Your skit went viral. **Collect ₦100k.**
13. Estate dues: **pay ₦30k per house and ₦120k per hotel** you own.
14. It's your birthday. **Collect ₦20k from each player.**
15. Bank charges, again. **Pay ₦15k.**
16. You sold your old phone. **Collect ₦45k.**

## Turn flow
1. **Roll** two dice. Doubles → after this turn you roll again. **Third double in a row → go to the Police Post** (option).
2. Move; passing/landing on Payday pays salary.
3. Resolve the space: buy or **auction** an unowned property; pay rent; card; tax; Checkpoint.
4. **Manage** (any time on your turn, before End turn): build/sell buildings, mortgage/unmortgage, propose trades.
5. **End turn.**

Owing more cash than you hold → you must raise money (sell buildings at half cost, mortgage, trade) or declare **bankruptcy**.

### Police Post (jail)
- Sent there by Checkpoint, a card, or three doubles. While detained you still collect rent and may build, trade and mortgage (option `rentWhileDetained`).
- Leave by: paying **₦60k** before rolling, using a **Bail card**, or rolling doubles (move by that roll; no extra roll). After the third failed attempt you pay ₦60k and move by that roll.

## Rules and options (RuleConfig)

```ts
export type PropertyRules = {
  turnSeconds: number;                       // per action, default 30
  mode: "timed" | "classic";
  timedMinutes: 30 | 45 | 60;
  startCash: number;                         // ₦1,000 units; default 2000
  salary: number;                            // default 300
  doublesRollAgain: boolean;
  threeDoublesToPolice: boolean;
  policeFine: number;                        // default 60
  maxDetainedTurns: number;                  // default 3
  rentWhileDetained: boolean;                // default true
  groupRentMultiplier: 1 | 2;                // full group unbuilt; default 2
  evenBuilding: boolean;                     // default true
  houseSupply: number;                       // default 32
  hotelSupply: number;                       // default 12
  mortgageInterestPct: number;               // default 10 (paid when you unmortgage)
  mortgageTransferInterest: "immediate" | "on_unmortgage"; // receiving a mortgaged property via trade/bankruptcy; default "immediate"
  auctions: boolean;                         // unbought property goes to auction; default true
  auctionSecondsPerBid: number;              // default 8
  minBidIncrement: number;                   // default 10 (₦10k)
  trading: boolean;                          // default true
  // House rules — all off in Naija Standard
  owambeJackpot: boolean;                    // taxes and card fines go to Owambe; landing there collects them
  doubleSalaryOnExactLanding: boolean;       // land exactly on Payday → ₦600k
  noRentInPolicePost: boolean;               // detained owners can't collect rent (inverse of rentWhileDetained)
};

export const propertyNaija: PropertyRules = {
  turnSeconds: 30, mode: "timed", timedMinutes: 45, startCash: 2000, salary: 300,
  doublesRollAgain: true, threeDoublesToPolice: true, policeFine: 60, maxDetainedTurns: 3,
  rentWhileDetained: true, groupRentMultiplier: 2, evenBuilding: true, houseSupply: 32, hotelSupply: 12,
  mortgageInterestPct: 10, mortgageTransferInterest: "immediate", auctions: true,
  auctionSecondsPerBid: 8, minBidIncrement: 10, trading: true,
  owambeJackpot: false, doubleSalaryOnExactLanding: false, noRentInPolicePost: false,
};
```

> ⚠️ Unverified: whether Nigerian groups commonly play the "free parking jackpot" house rule. We found no Nigeria-specific evidence, so all house rules start **off**; the rules sheet makes them one tap away.

### Building rules
- Build only on a **complete group** with **no mortgaged property** in it; **even building** (no property more than one house ahead of the others in its group; same for selling).
- **Limited supply** (32 houses, 12 hotels by default). **Shortage:** when two or more players want the last houses, they are **auctioned** (same auction protocol). Selling hotels back needs enough houses in the bank to break them down; if not, you must sell down further.
- Sell buildings back to the bank for **50 %** of build cost.

### Mortgages
- Mortgage an unbuilt property (no buildings anywhere in its group) for its mortgage value. No rent while mortgaged.
- Unmortgage for mortgage value + **10 %** interest.

### Bankruptcy
- **To a player** (you owe them): everything you own goes to them: cash, properties (mortgaged ones keep their mortgage; the receiver pays the 10 % transfer interest immediately or keeps them mortgaged per option), Bail cards. Buildings are first sold to the bank at half price and that cash is included.
- **To the bank** (tax, card, Police fine): buildings returned; properties go to **auction** one by one (unmortgaged) among the remaining players; cash to the bank.
- A bankrupt player becomes a spectator; their place is recorded.

## Modes

### Timed (default, recommended)
- 30 / 45 / **60** minutes chosen by the host (Naija Standard **45**). The clock starts at the first roll and is shown in the top bar.
- At 0: **"Last round!"** — play continues until the turn comes back to the first player (so everyone had the same number of turns), then the game ends.
- **Winner: highest net worth.** Places by net worth; ties → more cash; still tied → server coin flip.
- **Net worth** (₦):
  - cash;
  - each **unmortgaged** property at its **price**;
  - each **mortgaged** property at its **mortgage value** (50 % of price) — the mortgage cash is already in "cash", so mortgaging doesn't change net worth;
  - each house at its **build cost**, each hotel at **5 × build cost**;
  - each Bail card at the **Police fine** (₦60k).
  Unpaid debts (mid-payment) are subtracted.
- Bankruptcies still remove players early.

### Classic
- Last player not bankrupt wins. A safety cap (option, default **3 hours**) ends the game by net worth so a room can't run forever.

## Trading
- **Allowed:** any time during the game when no auction or payment is pending, between any two non-bankrupt players (it need not be either's turn). **On** in Naija Standard (trading is the heart of the game); `trading: false` turns it off.
- **What can be traded:** cash, properties, Bail cards. **A property can't be traded while any property in its group has buildings** — sell the buildings first (UI explains).
- **Offer** `{ to, give: { cash, props[], bailCards }, get: { cash, props[], bailCards } }`.
- **Limits:** one open offer per ordered pair (A→B) at a time; at most 2 open offers sent per player; offers **expire after 60 s**; an offer is void if anything in it changes hands or gets built on.
- **Responses:** accept, decline, **counter** (= decline + a new offer back, pre-filled).
- Cash in an offer must be ≤ the giver's cash at acceptance time.
- Accepted trades apply atomically in one action. Mortgaged properties carry their mortgage (transfer interest per rule).
- **Anti-gifting** (tournaments and bot-filled rooms): a trade where one side's value (property prices + cash) is less than **25 %** of the other side's is refused in tournament rooms ("That trade is too one-sided for a tournament"). Private rooms allow anything. See `14-security.md`.
- **Drafts never touch storage:** an offer is an action that is persisted (it changes shared state), but composing it in the UI is client-only.

## Auctions
- **Trigger:** the player who lands on an unowned property declines to buy (or times out); also building shortages and bank bankruptcies.
- **Everyone non-bankrupt may bid**, including the player who declined.
- Opening bid ₦10k; each bid must beat the current high by at least **₦10k** (`minBidIncrement`). UI buttons +₦10k, +₦50k, +₦100k and a custom amount.
- **Timer:** 8 s, **reset to 8 s on every bid**. When it runs out, the high bidder pays and gets the property. No bids → stays with the bank.
- A bid above your cash is refused (you can't bid money you don't have; you may mortgage first).
- **Ties can't happen** (a bid must strictly beat the high bid; the server orders bids by arrival).
- **Disconnected players** don't bid (they're simply silent); a seat played by a bot bids with the bot valuation.
- **Cost-saving:** bids live **in memory only**. The auction's start and its result are persisted (2 writes per auction). If the room is evicted mid-auction (rare: someone is always connected), the auction restarts from the opening bid. The 8-s deadline is pushed later on each bid → no `setAlarm` write (lazy alarm, `05-durable-objects.md`).

## Hidden information
Only the **card deck order** and the RNG seed. Everything else (cash, properties, offers between two players) is public — offers are shown to the two parties and as "A and B are negotiating" to others (contents private until accepted, to avoid pressure from third parties; this is UI etiquette, not secrecy: the accepted result is public).

## State, actions, view, events

```ts
type PropertyState = {
  players: number;
  order: SeatIndex[];                     // turn order (random at start)
  turn: number;                           // index into order
  phase: "roll" | "decide" | "manage" | "auction" | "raise_cash" | "over";
  pos: number[];                          // board index per seat
  cash: number[];                         // ₦1,000 units
  owner: Record<number, SeatIndex>;       // space → owner
  houses: Record<number, number>;         // 0–4, 5 = hotel
  mortgaged: number[];                    // spaces
  bank: { houses: number; hotels: number };
  bailCards: Record<SeatIndex, ("gist" | "hustle")[]>;
  detained: Record<SeatIndex, number>;    // failed attempts so far
  doublesInRow: number;
  lastRoll: [number, number] | null;
  decks: { gist: number[]; hustle: number[] }; // card ids in draw order — HIDDEN
  pendingDebt: { from: SeatIndex; to: SeatIndex | "bank"; amount: number } | null;
  auction: { space: number | "house" | "hotel"; high: number; by: SeatIndex | null; endsAt: number } | null;
  offers: TradeOffer[];
  jackpot: number;                        // Owambe house rule
  bankrupt: SeatIndex[];                  // in order of elimination
  timer: { endsAt: number; lastRound: boolean } | null; // timed mode
  ledger: { bankOut: number; bankIn: number }; // for the money-conservation invariant
  places: SeatIndex[][] | null;
};

type TradeOffer = { id: string; from: SeatIndex; to: SeatIndex; give: Bundle; get: Bundle; expiresAt: number };
type Bundle = { cash: number; props: number[]; bailCards: number };

type PropertyAction =
  | { type: "roll" } | { type: "buy" } | { type: "decline" }                 // decline → auction
  | { type: "bid"; amount: number } | { type: "pass_bid" }
  | { type: "build"; space: number } | { type: "sell_building"; space: number }
  | { type: "mortgage"; space: number } | { type: "unmortgage"; space: number }
  | { type: "pay_fine" } | { type: "use_bail" }
  | { type: "offer"; offer: Omit<TradeOffer, "id" | "from" | "expiresAt"> }
  | { type: "accept_offer"; id: string } | { type: "decline_offer"; id: string } | { type: "cancel_offer"; id: string }
  | { type: "declare_bankruptcy" } | { type: "end_turn" };

type PropertyView = Omit<PropertyState, "decks"> & {
  decksLeft: { gist: number; hustle: number };
  netWorth: number[];
  offers: TradeOffer[];                 // only offers you sent or received (others: { from, to } only)
};
```

Events: `rolled{seat, dice}`, `moved{seat, from, to, path}`, `salary{seat}`, `bought{seat, space, price}`, `rent{from, to, amount}`, `card{seat, deck, id}`, `police{seat}`, `released{seat, how}`, `auction_started{space}`, `bid{seat, amount}`, `auction_won{seat, space, price}`, `built{seat, space}`, `mortgaged{seat, space}`, `trade_done{a, b}`, `bankrupt{seat, to}`, `last_round`, `game_over`.

**Timeout actions** (per phase): roll → `roll`; decide → `decline` (goes to auction); auction → `pass_bid`; raise_cash → mortgage/sell automatically by the "least valuable first" rule, else bankruptcy; manage → `end_turn`; pending offer to you → declined at expiry. 3 consecutive timeouts → `left` (bot takes over, standard).

Chained turns (`chainTurns`): a bot's whole turn (roll → buy/decline → build → end) is one write; clients play it back (dice 900 ms, token hops 90 ms/space), like Ludo.

## Bots

Research basis (Markov-chain studies of the genre's board): the most-visited space is the jail corner; the group just after it (our **Sunset**, 16–19) and the next one (**Palm**) are landed on most often; the best return on building comes at the **third house**; transport spaces are landed on a lot early; late in the game, **staying in jail is good** (you collect rent and avoid paying it).

**Valuation** `value(space, seat)` (₦): price × (1 + groupProgress bonus: +40 % if it completes a group for you, +25 % if it blocks someone else's group) × landing-frequency weight (from a precomputed table for our board, generated by simulation) − mortgage penalty. Cash has value 1 until the reserve floor (₦150k early, ₦300k late), then 1.3.

| Level | Buying | Auctions | Building | Police Post | Trading |
|---|---|---|---|---|---|
| Easy | Buys if cash after > ₦100k | Bids up to 0.8 × price, random stops | Builds evenly when cash > ₦300k | Pays to leave | Accepts offers whose value gain > 0 (no look at groups), never proposes |
| Medium | Buys by valuation with reserve | Bids up to 0.9 × value | Aims for 3 houses everywhere first | Pays early game, stays late game (after 15 turns or when opponents have hotels) | Accepts if value gain ≥ 10 % |
| Hard | Medium + prefers Sunset/Palm/transport | Bids up to value, snipes on the last second, raises opponents' prices on groups they need | 3-house rule, triggers building shortage when ahead | As Medium, plus stays whenever expected rent ≥ fine | Accepts by valuation; **proposes** trades that complete one of its groups when the other side gains ≥ 5 % by its valuation (max one proposal per 10 turns per opponent) |

All bot decisions are O(board size) arithmetic — well under 1 ms (CPU budget).

## UI notes
- **Board:** square loop of 40 rounded tiles around a centre panel; your token at the bottom edge. Tiles show colour band, area name, city in small text, price. Tap a tile → card sheet (rents table, owner, buildings, mortgage).
- Tokens: up to 8, distinct colours + initials (`11-design-system.md` token colours).
- Centre panel: dice, turn banner, "Last round" timer (timed mode), current card, auction panel (high bid, countdown ring, bid buttons), offers inbox.
- Player strip: cash and net worth for each player; tap for their properties.
- Buildings: small house glyphs, hotel glyph; mortgaged tiles greyed with a diagonal line.
- Trade composer: two columns (you give / you get), property chips, cash stepper; counter pre-fills.
- Copy: "Pay ₦38k rent to @ada", "Auction: Surulere — ₦120k by @tunde · 0:06", "Last round!".

## Invariants
- **Money conservation:** `Σ cash + jackpot + ledger.bankOut − ledger.bankIn === startCash × players` after every action (every bank payment/receipt goes through the ledger).
- **Building supply:** `bank.houses + Σ houses on board (hotel counts 0 houses) === houseSupply`; same for hotels.
- Even building holds in every group; no buildings on mortgaged properties or incomplete groups.
- Each property has at most one owner; bankrupt players own nothing.
- Card decks: each card id appears exactly once across deck + held Bail cards.

## Tests and balance simulation
- Example tests for every rule and option (on/off), card effects, police flows, bankruptcy to player/bank, trade validity and expiry, auction timer resets.
- Properties (≥ 1,000 runs): conservation of money and buildings, no illegal ownership, termination (timed: by the clock; classic: within the 3-hour cap measured in turns ≈ 600 turns), determinism, no deck order in any view.
- **Monte Carlo balance** (CI job, 10,000 games each, Medium bots, 2/4/6/8 players):
  - Classic game length: median **30–60 rounds** for 4 players; ≥ 95 % end by bankruptcy within 150 rounds.
  - Timed 45-minute equivalent (simulate 18 rounds for 4 players): net worth spread — winner's net worth ≤ 3× the median player's in 80 % of games (so comebacks are possible).
  - **Group strength:** for each group, the win rate of the player who completes it; no group more than **2×** another's (the cheap groups will be weaker — acceptable within the band).
  - **First-player advantage:** first seat win rate within **± 3 points** of `1/players`.
  - Money supply: total cash in play after 30 rounds within 0.5×–3× the starting total (inflation check).
  - Outputs go into a markdown report artifact; the multipliers in the price formula are tuned until all bands pass, then the table above is regenerated.

## Free-tier cost per game
- Actions: ≈ 3 per turn (roll, buy/decline, end) + building/trading. Bot turns are chained (1 write). Auction bids aren't persisted.
- **4 players, 45 minutes:** ≈ 70 turns → ≈ 210 actions, ~60 % from humans → **≈ 250 rows** (state + some alarms), ≈ 250 requests.
- **8 players, 45 minutes:** turns go round faster (shorter per-player share) ≈ 100 turns → ≈ 300 actions + more auctions/trades → **≈ 380 rows**, ≈ 380 requests.
- The heaviest game per match after Ludo; see `13-free-tier-budget.md`.
