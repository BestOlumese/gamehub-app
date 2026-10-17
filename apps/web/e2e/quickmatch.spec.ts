import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { pickUsername, signUpAndVerify } from "./flows";
import { uniqueEmail } from "./mailpit";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const uname = (tag: string) =>
  `${tag}_${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;

async function player(browser: Browser, tag: string, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext({
    ...devices["Pixel 7"],
    ...(viewport ? { viewport } : {}),
    baseURL: BASE_URL,
  });
  const page = await ctx.newPage();
  const username = uname(tag);
  await signUpAndVerify(page, uniqueEmail(tag));
  await pickUsername(page, username);
  return { ctx, page, username };
}

const shot = async (p: Page, name: string) => {
  const path = test.info().outputPath(`${name}.png`);
  await p.screenshot({ path, fullPage: true });
  await test.info().attach(name, { path, contentType: "image/png" });
};

const squares = (p: Page) => p.getByRole("group", { name: "Board squares" });
const sq = (p: Page, name: string | number) =>
  squares(p).getByRole("button", { name: new RegExp(`^${name},`) });
const moveList = (p: Page) => p.getByRole("list", { name: "Moves" }).getByRole("button");

/** Whose turn it is (colours are random in quick match). */
async function mover(pages: Page[]): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    for (const p of pages)
      if (await p.getByText("Your move", { exact: false }).isVisible()) return p;
    await pages[0]!.waitForTimeout(150);
  }
  throw new Error("nobody to move");
}

/** Presses `from` then `to`; true once the move list on this page reaches `count`. */
async function play(p: Page, from: string | number, to: string | number, count: number) {
  await sq(p, from).press("Enter");
  await sq(p, to).press("Enter");
  return expect(moveList(p))
    .toHaveCount(count, { timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
}

/** Two plies, so the game can't be aborted any more (a result, then, rather than no game). */
async function openChess(pages: Page[]) {
  const w = await mover(pages);
  expect(await play(w, "e2", "e4", 1)).toBe(true);
  const b = pages.find((p) => p !== w)!;
  await expect(b.getByText("Your move", { exact: false })).toBeVisible({ timeout: 10_000 });
  expect(await play(b, "e7", "e5", 2)).toBe(true);
}

/** Naija draughts: light opens 32-28, dark 19-23 (either may start). */
async function openDraughts(pages: Page[]) {
  for (let ply = 1; ply <= 2; ply++) {
    const p = await mover(pages);
    if (!(await play(p, 32, 28, ply))) expect(await play(p, 19, 23, ply)).toBe(true);
  }
}

async function resign(p: Page) {
  await p.getByRole("button", { name: "Resign" }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Resign" }).click();
}

test("quick match: ranked chess blitz and draughts; ratings on profiles; leaderboards show both", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const [a, b] = await Promise.all([
    player(browser, "qm_a", { width: 360, height: 760 }),
    player(browser, "qm_b"),
  ]);

  // A starts from the Chess tile: Quick match, 3+2, Find players.
  await a.page
    .locator("li")
    .filter({ hasText: "Chess" })
    .getByRole("button", { name: "Quick match" })
    .click();
  await a.page.getByRole("dialog").getByRole("button", { name: /^3\+2/ }).click();
  await shot(a.page, "quick-sheet-360");
  await a.page.getByRole("button", { name: "Find players" }).click();
  await expect(a.page).toHaveURL(/\/play\/quick\?/);
  await expect(a.page.getByText("1 of 2 found")).toBeVisible({ timeout: 15_000 });
  await expect(a.page.getByText(/^Bots join in 0:/)).toBeVisible();
  await shot(a.page, "quick-queue-360");
  // B joins the same queue: both are sent to the same ranked room.
  await b.page.goto("/play/quick?g=chess&n=2&tc=180%2B2");
  for (const p of [a.page, b.page])
    await expect(p).toHaveURL(/\/r\/[A-Z2-9]{6}$/, { timeout: 15_000 });
  expect(a.page.url()).toBe(b.page.url());
  await expect(a.page.getByText("Quick match · 3+2")).toBeVisible({ timeout: 15_000 });
  await expect(a.page.getByText("Ranked", { exact: true })).toBeVisible();
  await shot(a.page, "quick-room-360");

  await openChess([a.page, b.page]);
  await resign(a.page);
  for (const p of [a.page, b.page])
    await expect(p.getByRole("button", { name: "Play again" })).toBeVisible({ timeout: 15_000 });
  await shot(a.page, "quick-over-360");

  // Profiles: the blitz pool, a placement game each, the result with the rating change.
  await expect
    .poll(
      async () => {
        await a.page.goto(`/u/${a.username}`);
        return a.page.getByText("Placement 1/10").isVisible();
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect(a.page.getByText("Chess · Blitz")).toBeVisible();
  await expect(a.page.getByText("Lost", { exact: true })).toBeVisible();
  await expect(a.page.getByText(/^-\d+$/)).toBeVisible();
  await shot(a.page, "profile-360");
  await b.page.goto(`/u/${b.username}`);
  await expect(b.page.getByText("Won", { exact: true })).toBeVisible();
  await expect(b.page.getByText(/^\+\d+$/)).toBeVisible();

  // Draughts, Naija board: B resigns this time.
  await a.page.goto("/play/quick?g=draughts&n=2&v=naija10");
  await expect(a.page.getByText("1 of 2 found")).toBeVisible({ timeout: 15_000 });
  await b.page.goto("/play/quick?g=draughts&n=2&v=naija10");
  for (const p of [a.page, b.page])
    await expect(p).toHaveURL(/\/r\/[A-Z2-9]{6}$/, { timeout: 15_000 });
  await expect(b.page.getByText("Ranked", { exact: true })).toBeVisible({ timeout: 15_000 });
  await openDraughts([a.page, b.page]);
  await resign(b.page);
  await expect(b.page.getByRole("button", { name: "Play again" })).toBeVisible({
    timeout: 15_000,
  });

  // Leaderboards: both of them in chess blitz and in Naija draughts (still in placement).
  for (const [game, v] of [
    ["chess", "blitz"],
    ["draughts", "naija10"],
  ] as const) {
    await expect
      .poll(
        async () => {
          await a.page.goto(`/leaderboards?game=${game}&v=${v}&p=all`);
          return (
            (await a.page.getByRole("link", { name: "You", exact: true }).isVisible()) &&
            (await a.page.getByRole("link", { name: `@${b.username}` }).isVisible())
          );
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  }
  await shot(a.page, "leaderboard-360");
  await a.ctx.close();
  await b.ctx.close();
});
