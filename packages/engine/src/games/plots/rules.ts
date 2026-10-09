// Plain values and types only (no zod), so the browser can import them cheaply.

/** Money is in ₦1,000 units throughout (2000 = ₦2M). */
export type PlotsRules = {
  /** Per action (roll, buy, end turn…), 10–120 s. */
  turnSeconds: number;
  /** "timed": the highest net worth when the clock runs out; "classic": the last player standing. */
  mode: "timed" | "classic";
  timedMinutes: 30 | 45 | 60;
  /** Classic games end by net worth after this many hours, so a room can't run forever. */
  classicCapHours: number;
  startCash: number;
  salary: number;
  doublesRollAgain: boolean;
  threeDoublesToPolice: boolean;
  policeFine: number;
  maxDetainedTurns: number;
  rentWhileDetained: boolean;
  groupRentMultiplier: 1 | 2;
  evenBuilding: boolean;
  houseSupply: number;
  hotelSupply: number;
  /** Paid on top of the mortgage value when you unmortgage (percent). */
  mortgageInterestPct: number;
  /** Receiving a mortgaged plot (trade, bankruptcy): pay the interest at once, or when you unmortgage. */
  mortgageTransferInterest: "immediate" | "on_unmortgage";
  auctions: boolean;
  auctionSecondsPerBid: number;
  minBidIncrement: number;
  trading: boolean;
  // House rules, all off in Naija Standard.
  /** Taxes and card fines go to Owambe; landing there collects them. */
  owambeJackpot: boolean;
  /** Landing exactly on Payday pays double salary. */
  doubleSalaryOnExactLanding: boolean;
};

export const plotsNaija: PlotsRules = {
  turnSeconds: 30,
  mode: "timed",
  timedMinutes: 45,
  classicCapHours: 3,
  startCash: 2000,
  salary: 300,
  doublesRollAgain: true,
  threeDoublesToPolice: true,
  policeFine: 60,
  maxDetainedTurns: 3,
  rentWhileDetained: true,
  groupRentMultiplier: 2,
  evenBuilding: true,
  houseSupply: 32,
  hotelSupply: 12,
  mortgageInterestPct: 10,
  mortgageTransferInterest: "immediate",
  auctions: true,
  auctionSecondsPerBid: 8,
  minBidIncrement: 10,
  trading: true,
  owambeJackpot: false,
  doubleSalaryOnExactLanding: false,
};
