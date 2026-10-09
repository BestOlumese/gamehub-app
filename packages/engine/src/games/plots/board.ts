// The Naija Plots board: our own spaces, prices and rents (docs/games/property.md). Money is in
// ₦1,000 units. Rents come from our formula, never from another game's table.

export type Group = "clay" | "sky" | "coral" | "sunset" | "palm" | "gold" | "forest" | "royal";
export type City = "LAG" | "ABJ" | "PH" | "IBD" | "ENU" | "KAN";
export type Deck = "gist" | "hustle";

export type Space =
  | { kind: "payday"; name: string }
  | { kind: "police"; name: string }
  | { kind: "owambe"; name: string }
  | { kind: "checkpoint"; name: string }
  | { kind: "plot"; name: string; city: City; group: Group; price: number }
  | { kind: "transport"; name: string; price: number }
  | { kind: "utility"; name: string; price: number }
  | { kind: "tax"; name: string; amount: number }
  | { kind: "card"; name: string; deck: Deck };

const plot = (name: string, city: City, group: Group, price: number): Space => ({
  kind: "plot",
  name,
  city,
  group,
  price,
});
const gist: Space = { kind: "card", name: "Gist", deck: "gist" };
const hustle: Space = { kind: "card", name: "Hustle", deck: "hustle" };
const transport = (name: string): Space => ({ kind: "transport", name, price: 220 });
const utility = (name: string): Space => ({ kind: "utility", name, price: 170 });

export const SPACES: readonly Space[] = [
  { kind: "payday", name: "Payday" },
  plot("Ojo", "LAG", "clay", 80),
  { kind: "tax", name: "Area Levy", amount: 200 },
  plot("Challenge", "IBD", "clay", 90),
  transport("Danfo Park"),
  gist,
  plot("Ikorodu", "LAG", "sky", 120),
  plot("Kubwa", "ABJ", "sky", 130),
  hustle,
  plot("Apata", "IBD", "sky", 150),
  { kind: "police", name: "Police Post" },
  plot("Yaba", "LAG", "coral", 170),
  plot("Woji", "PH", "coral", 180),
  utility("Power Supply"),
  transport("BRT Terminal"),
  plot("Trans-Ekulu", "ENU", "coral", 200),
  plot("Surulere", "LAG", "sunset", 220),
  gist,
  plot("Gwarinpa", "ABJ", "sunset", 230),
  plot("Sabon Gari", "KAN", "sunset", 250),
  { kind: "owambe", name: "Owambe" },
  plot("Gbagada", "LAG", "palm", 270),
  hustle,
  plot("Bodija", "IBD", "palm", 280),
  transport("Rail Station"),
  plot("New GRA", "PH", "palm", 300),
  plot("Magodo GRA", "LAG", "gold", 320),
  utility("Water Board"),
  plot("Independence Layout", "ENU", "gold", 330),
  plot("Nassarawa GRA", "KAN", "gold", 350),
  { kind: "checkpoint", name: "Checkpoint" },
  plot("Lekki Phase 1", "LAG", "forest", 380),
  plot("Old GRA", "PH", "forest", 390),
  gist,
  transport("Airport"),
  plot("Wuse II", "ABJ", "forest", 420),
  { kind: "tax", name: "Diesel Money", amount: 120 },
  plot("Maitama", "ABJ", "royal", 470),
  hustle,
  plot("Banana Island", "LAG", "royal", 520),
];

export const PAYDAY = 0;
export const POLICE_POST = 10;
export const OWAMBE = 20;
export const CHECKPOINT = 30;

export const GROUPS: readonly Group[] = [
  "clay",
  "sky",
  "coral",
  "sunset",
  "palm",
  "gold",
  "forest",
  "royal",
];

/** Cost of one house (a hotel costs one more). */
export const BUILD_COST: Record<Group, number> = {
  clay: 60,
  sky: 60,
  coral: 110,
  sunset: 110,
  palm: 160,
  gold: 160,
  forest: 210,
  royal: 210,
};

export const GROUP_COLOUR: Record<Group, string> = {
  clay: "#A0674B",
  sky: "#5BB5E0",
  coral: "#E4717A",
  sunset: "#EE8A2B",
  palm: "#3E9B5F",
  gold: "#D9A520",
  forest: "#1F6F4A",
  royal: "#3B4BA8",
};

export const CITY_NAME: Record<City, string> = {
  LAG: "Lagos",
  ABJ: "Abuja",
  PH: "Port Harcourt",
  IBD: "Ibadan",
  ENU: "Enugu",
  KAN: "Kano",
};

/** Spaces in each group, in board order. */
export const GROUP_SPACES: Record<Group, readonly number[]> = Object.fromEntries(
  GROUPS.map((g) => [g, SPACES.flatMap((s, i) => (s.kind === "plot" && s.group === g ? [i] : []))]),
) as Record<Group, number[]>;

export const TRANSPORTS: readonly number[] = SPACES.flatMap((s, i) =>
  s.kind === "transport" ? [i] : [],
);
export const UTILITIES: readonly number[] = SPACES.flatMap((s, i) =>
  s.kind === "utility" ? [i] : [],
);

/** Can be owned: plots, transport, utilities. */
export const isOwnable = (i: number) => {
  const k = SPACES[i]?.kind;
  return k === "plot" || k === "transport" || k === "utility";
};
export const priceOf = (i: number): number => {
  const s = SPACES[i];
  return s && (s.kind === "plot" || s.kind === "transport" || s.kind === "utility") ? s.price : 0;
};
export const groupOf = (i: number): Group | null => {
  const s = SPACES[i];
  return s?.kind === "plot" ? s.group : null;
};
export const mortgageValue = (i: number) => Math.round(priceOf(i) / 2);

// ---- Rents (our formula, docs/games/property.md) ----

/** Base rent as a share of the price. */
export const RENT_PCT = 0.075;
/** Multipliers on the base rent for 1–4 houses and a hotel. */
export const HOUSE_MULTIPLIERS = [5, 14, 32, 42, 52] as const;
/**
 * Rent boost per group, from the balance simulation: two-plot groups are landed on less, and
 * Clay is also the cheapest, so its rents need the biggest lift to be worth completing.
 */
export const RENT_FACTOR: Partial<Record<Group, number>> = { clay: 4, royal: 2 };
const to5 = (x: number) => Math.round(x / 5) * 5;

/** Base rent of a plot: 7.5 % of the price (times its group's factor), at least ₦6k. */
export function baseRent(space: number): number {
  const sp = SPACES[space];
  if (sp?.kind !== "plot") return 0;
  return Math.max(6, Math.round(sp.price * RENT_PCT * (RENT_FACTOR[sp.group] ?? 1)));
}

/** Rent of a plot with 0–4 houses or a hotel (5); 0 means the unbuilt base rent. */
export function plotRent(space: number, houses: number): number {
  const base = baseRent(space);
  if (houses <= 0) return base;
  return to5(base * (HOUSE_MULTIPLIERS[houses - 1] as number));
}

/** Transport rent by how many the owner has (1–4). */
export const transportRent = (owned: number) => (owned > 0 ? 30 * 2 ** (owned - 1) : 0);
/** Utility rent per dice point: one owned ₦5k, both ₦12k. */
export const utilityRate = (owned: number) => (owned >= 2 ? 12 : owned === 1 ? 5 : 0);

/** "₦80k", "₦1.2M", "₦2M" from ₦1,000 units. */
export function naira(k: number): string {
  if (k === 0) return "₦0";
  const sign = k < 0 ? "−" : "";
  const n = Math.abs(k);
  if (n >= 1000) {
    const m = n / 1000;
    return `${sign}₦${Number.isInteger(m) ? m : m.toFixed(m < 10 ? 2 : 1).replace(/0$/, "")}M`;
  }
  return `${sign}₦${n}k`;
}
