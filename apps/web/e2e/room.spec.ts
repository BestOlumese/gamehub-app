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

/** Host opens the setup sheet and makes a Tic-tac-toe room. Returns the code. */
async function createRoom(
  page: Page,
  opts: { oneGame?: boolean; bot?: "Easy" | "Medium" | "Hard" } = {},
) {
  await page
    .locator("li")
    .filter({ hasText: "Tic-tac-toe" })
    .getByRole("button", { name: "Play with friends" })
    .click();
  if (opts.oneGame) {
    await page.getByText("Custom", { exact: true }).click();
    await page.getByText("1 game", { exact: true }).click();
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();
  if (opts.bot) {
    await page.getByText("Play a bot", { exact: true }).click();
    await page.getByText(opts.bot, { exact: true }).click();
  }
  // These tests script the moves, so the host (seat 1) must start.
  await page.getByText("Seat 1", { exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Goes first")).toBeVisible();
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page).toHaveURL(/\/r\/[A-Z2-9]{6}$/, { timeout: 20_000 });
  await expect(page.getByText("Room code", { exact: true })).toBeVisible({ timeout: 20_000 });
  return page.url().split("/r/")[1]!;
}

const cell = (page: Page, label: string) =>
  page.getByRole("gridcell", { name: new RegExp(`^${label}:`) });

async function move(page: Page, label: string) {
  await expect(page.getByText("Your turn")).toBeVisible({ timeout: 15_000 });
  await cell(page, label).click();
  await expect(cell(page, label)).toHaveAccessibleName(/: (X|O)$/);
}

test("Snakes & Ladders: 2 people and 6 bots play an 8-player game to the end", async ({
  browser,
}) => {
  // The longest test: it runs first so it never holds up the end of the suite.
  test.setTimeout(720_000);
  const shot = async (p: Page, name: string) => {
    const path = test.info().outputPath(`${name}.png`);
    await p.screenshot({ path });
    await test.info().attach(name, { path, contentType: "image/png" });
  };
  const host = await player(browser, "snk_h");
  // The guest is on a small phone, so the 8-player layout is checked at 360 × 640 too.
  const guest = await player(browser, "snk_g", { width: 360, height: 640 });

  const tile = host.page.locator("li").filter({ hasText: "Snakes & Ladders" });
  await tile.getByRole("button", { name: "Play with friends" }).click();
  await host.page.getByRole("button", { name: "8", exact: true }).click();
  await host.page.getByRole("button", { name: "Next", exact: true }).click(); // players → rules
  await expect(host.page.getByText("Naija Standard")).toBeVisible();
  // Quick board, no exact finish, first to 100 ends it: an 8-player game in a few minutes.
  await host.page.getByRole("button", { name: /^Quick/ }).click();
  await shot(host.page, "snakes-boards");
  await host.page.getByRole("switch", { name: "Exact roll to finish" }).click();
  await host.page.getByRole("switch", { name: "First to 100 ends it" }).click();
  await shot(host.page, "snakes-rules");
  await host.page.getByRole("button", { name: "Next", exact: true }).click(); // rules → seats
  await host.page.getByText("Easy", { exact: true }).click();
  await host.page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(host.page.getByText(/Quick board/)).toBeVisible();
  await host.page.getByRole("button", { name: "Create room" }).click();
  await expect(host.page.getByText("Room code", { exact: true })).toBeVisible({ timeout: 20_000 });
  const code = host.page.url().split("/r/")[1]!;
  await guest.page.goto(`/r/${code}`);
  await expect(guest.page.getByText(/Waiting for @/)).toBeVisible({ timeout: 20_000 });
  await host.page.getByRole("button", { name: "Start game · bots take 6 seats" }).click();

  const pages = [host.page, guest.page];
  for (const p of pages) {
    await expect(p.getByRole("img", { name: "Snakes and Ladders board" })).toBeVisible();
    await expect(p.getByRole("list", { name: "Players" }).getByRole("listitem")).toHaveCount(8);
  }

  // Roll whenever the die is offered, until both see the result.
  const result = (p: Page) => p.getByRole("dialog").filter({ hasText: /won/ });
  const deadline = Date.now() + 600_000;
  let shots = 0;
  const start = Date.now();
  while (Date.now() < deadline) {
    if ((await Promise.all(pages.map((p) => result(p).isVisible()))).every(Boolean)) break;
    for (const p of pages) {
      const die = p.getByRole("button", { name: "Roll the die" });
      if (await die.isVisible()) await die.click({ timeout: 800 }).catch(() => {});
    }
    if (shots < 3 && Date.now() > start + 25_000 * (shots + 1)) {
      for (const [i, p] of pages.entries()) await shot(p, `snakes-mid-${shots}-${i}`);
      shots++;
    }
    await host.page.waitForTimeout(300);
  }
  for (const [i, p] of pages.entries()) {
    if (!(await result(p).isVisible())) {
      await shot(p, `snakes-player-${i}`);
    }
  }
  for (const p of pages) await expect(result(p)).toBeVisible();
  for (const [i, p] of pages.entries()) await shot(p, `snakes-end-${i}`);
  // Every seat gets a place, 1st to 8th.
  await expect(result(host.page).getByRole("listitem")).toHaveCount(8);
  await expect(result(host.page).getByText("1st", { exact: true })).toBeVisible();
  for (const c of [host.ctx, guest.ctx]) await c.close();
});

test("the host edits the room in the lobby: game, seats, who goes first, and a seat shuffle", async ({
  browser,
}) => {
  const host = await player(browser, "edit_h");
  const guest = await player(browser, "edit_g");
  const code = await createRoom(host.page);
  await guest.page.goto(`/r/${code}`);
  await expect(guest.page.getByText(/Waiting for @/)).toBeVisible({ timeout: 20_000 });
  await expect(guest.page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0); // host only

  // Tic-tac-toe for 2 → Whot for 4, last winner starts.
  await host.page.getByRole("button", { name: "Edit", exact: true }).click();
  const sheet = host.page.getByRole("dialog");
  await expect(sheet.getByText("Room settings")).toBeVisible();
  const shot = async (name: string) => {
    const path = test.info().outputPath(`${name}.png`);
    await host.page.screenshot({ path });
    await test.info().attach(name, { path, contentType: "image/png" });
  };
  await shot("edit-game-step");
  await sheet.getByText("Whot", { exact: true }).click();
  await sheet.getByRole("button", { name: "Next", exact: true }).click(); // game → players
  await expect(sheet.getByRole("button", { name: "1", exact: true })).toHaveCount(0);
  await sheet.getByRole("button", { name: "4", exact: true }).click();
  await sheet.getByRole("button", { name: "Next", exact: true }).click(); // → rules
  await sheet.getByRole("button", { name: "Next", exact: true }).click(); // → seats
  await sheet.getByText("Winner", { exact: true }).click();
  await shot("edit-seats-step");
  await sheet.getByRole("button", { name: "Next", exact: true }).click(); // → review
  await sheet.getByRole("button", { name: "Save changes" }).click();

  for (const p of [host.page, guest.page]) {
    await expect(p.getByRole("heading", { name: "Whot" })).toBeVisible();
    await expect(p.getByText("Goes first: Last winner")).toBeVisible();
    await expect(p.getByText("2/4")).toBeVisible();
  }
  await shot("lobby-after-edit");

  // Two people are in, so 2 is the lowest count on offer.
  await host.page.getByRole("button", { name: "Edit", exact: true }).click();
  await sheet.getByRole("button", { name: "Next", exact: true }).click(); // game → players
  await expect(sheet.getByRole("button", { name: "2", exact: true })).toBeEnabled();
  await sheet.getByRole("button", { name: "3", exact: true }).click();
  for (let i = 0; i < 3; i++)
    await sheet.getByRole("button", { name: "Next", exact: true }).click();
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(guest.page.getByText("2/3")).toBeVisible();

  // Shuffle until the guest is listed first (each shuffle is a coin toss for two people).
  const players = guest.page.getByRole("region", { name: "Players" }).getByRole("listitem");
  for (let i = 0; i < 12; i++) {
    if ((await players.first().innerText()).includes(guest.username)) break;
    await host.page.getByRole("button", { name: "Shuffle seats" }).click();
    await host.page.waitForTimeout(300);
  }
  await expect(players.first()).toContainText(guest.username);
  await host.ctx.close();
  await guest.ctx.close();
});

test("two friends play a game, see the result, and rematch", async ({ browser }) => {
  const host = await player(browser, "host");
  const guest = await player(browser, "guest");
  const code = await createRoom(host.page, { oneGame: true });

  // Guest joins by typing the code.
  await guest.page.goto("/join");
  await guest.page.getByRole("textbox", { name: "Character 1" }).fill(code[0]!);
  await guest.page.keyboard.type(code.slice(1));
  await guest.page.getByRole("button", { name: "Join room" }).click();
  await expect(guest.page.getByText(`Waiting for @${host.username} to start`)).toBeVisible({
    timeout: 20_000,
  });
  await expect(host.page.getByText(`@${guest.username}`)).toBeVisible();

  await host.page.getByRole("button", { name: "Start game" }).click();
  await move(host.page, "top left");
  await move(guest.page, "middle left");
  await move(host.page, "top middle");
  await move(guest.page, "centre");
  await move(host.page, "top right");

  await expect(host.page.getByRole("heading", { name: "You won!" })).toBeVisible();
  await expect(guest.page.getByRole("heading", { name: `@${host.username} won` })).toBeVisible();

  await guest.page.getByRole("button", { name: "Rematch" }).click();
  await expect(host.page.getByRole("button", { name: "Start game" })).toBeVisible();
  await host.ctx.close();
  await guest.ctx.close();
});

test("a solo player finishes a game against a bot", async ({ browser }) => {
  const me = await player(browser, "solo");
  await createRoom(me.page, { oneGame: true, bot: "Easy" });
  await expect(me.page.getByText("Bot (Easy)")).toBeVisible();
  await me.page.getByRole("button", { name: "Start game" }).click();

  // Keep taking the first free cell until the game ends.
  const result = me.page.getByRole("dialog").filter({ hasText: /won|draw/ });
  for (let i = 0; i < 80 && !(await result.isVisible()); i++) {
    if (await me.page.getByText("Your turn").isVisible()) {
      await me.page
        .getByRole("gridcell", { name: /: empty$/ })
        .first()
        .click();
    }
    await me.page.waitForTimeout(400);
  }
  await expect(result).toBeVisible();
  await me.ctx.close();
});

test("a dropped player keeps their seat, then a bot covers once the grace ends", async ({
  browser,
}) => {
  const host = await player(browser, "drop_h");
  const guest = await player(browser, "drop_g");
  const code = await createRoom(host.page, { oneGame: true });
  await guest.page.goto(`/r/${code}`);
  await expect(guest.page.getByText(/Waiting for @/)).toBeVisible({ timeout: 20_000 });
  await host.page.getByRole("button", { name: "Start game" }).click();
  await move(host.page, "centre");

  // The guest's phone dies (Chrome's offline mode doesn't cut open WebSockets, so close the browser).
  const login = await guest.ctx.storageState();
  await guest.ctx.close();
  await expect(host.page.getByText(/Offline \(\d:\d\d\)/)).toBeVisible({ timeout: 15_000 });

  // Back within the grace: same seat, same board, still their turn.
  const back = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL: BASE_URL,
    storageState: login,
  });
  const page = await back.newPage();
  await page.goto(`/r/${code}`);
  await expect(page.getByText("Your turn")).toBeVisible({ timeout: 20_000 });
  await expect(cell(page, "centre")).toHaveAccessibleName(/: X$/);
  await expect(host.page.getByText(/Offline/)).toBeHidden();

  // Gone past the (test) grace: a bot plays the seat so the host isn't stuck.
  await back.close();
  await expect(host.page.getByText("A bot is playing for them")).toBeVisible({ timeout: 20_000 });
  await expect(host.page.getByText("Your turn")).toBeVisible({ timeout: 15_000 });
  await host.ctx.close();
});

test("an 8-player rock paper scissors knockout with 5 bots plays to a podium", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const host = await player(browser, "rps_h");
  const g1 = await player(browser, "rps_a");
  const g2 = await player(browser, "rps_b");

  const tile = host.page.locator("li").filter({ hasText: "Rock Paper Scissors" });
  await tile.getByRole("button", { name: "Play with friends" }).click();
  await host.page.getByRole("button", { name: "8", exact: true }).click();
  await host.page.getByRole("button", { name: "Next", exact: true }).click(); // players → rules
  await host.page.getByRole("button", { name: "Next", exact: true }).click(); // rules → seats (bots fill at start: on)
  await host.page.getByText("Easy", { exact: true }).click();
  await host.page.getByRole("button", { name: "Next", exact: true }).click();
  await host.page.getByRole("button", { name: "Create room" }).click();
  await expect(host.page.getByText("Room code", { exact: true })).toBeVisible({ timeout: 20_000 });
  const code = host.page.url().split("/r/")[1]!;

  for (const g of [g1, g2]) {
    await g.page.goto(`/r/${code}`);
    await expect(g.page.getByText(/Waiting for @/)).toBeVisible({ timeout: 20_000 });
  }
  await host.page.getByRole("button", { name: "Start game · bots take 5 seats" }).click();

  // Each player cycles rock → paper → scissors (so two humans don't tie forever)
  // whenever they're allowed to throw, until everyone sees the podium.
  const podium = (p: Page) => p.getByRole("dialog").filter({ hasText: /champion|won/ });
  const pages = [host.page, g1.page, g2.page];
  const order = ["Rock", "Paper", "Scissors"] as const;
  const turn = [0, 1, 2];
  const deadline = Date.now() + 200_000;
  while (Date.now() < deadline) {
    if ((await Promise.all(pages.map((p) => podium(p).isVisible()))).every(Boolean)) break;
    for (const [i, p] of pages.entries()) {
      const pick = order[turn[i]! % 3]!;
      const btn = p.getByRole("group", { name: "Your throw" }).getByRole("button", { name: pick });
      // Short timeouts: the picker can vanish at any moment (match over, knocked out), and an
      // untimed isEnabled()/click() would wait for it to come back forever.
      const ready =
        (await btn.isVisible()) && (await btn.isEnabled({ timeout: 300 }).catch(() => false));
      const clicked =
        ready &&
        (await btn
          .click({ timeout: 1000 })
          .then(() => true)
          .catch(() => false));
      if (clicked) turn[i]!++;
    }
    await host.page.waitForTimeout(250);
  }
  // If it didn't finish, keep a picture of every player's screen for the report.
  for (const [i, p] of pages.entries()) {
    if (!(await podium(p).isVisible())) {
      await test
        .info()
        .attach(`player-${i}`, { body: await p.screenshot(), contentType: "image/png" });
    }
  }
  for (const p of pages) await expect(podium(p)).toBeVisible();
  await expect(podium(host.page).getByText("1st", { exact: true })).toBeVisible();
  for (const c of [host.ctx, g1.ctx, g2.ctx]) await c.close();
});

test("a 4-player Whot game with 2 bots and decking plays to the end, hands kept private", async ({
  browser,
}) => {
  test.setTimeout(360_000); // bots take ~3 s a turn (Phase 4 pacing)
  const host = await player(browser, "whot_h");
  const guest = await player(browser, "whot_g");

  const tile = host.page.locator("li").filter({ hasText: "Whot" });
  await tile.getByRole("button", { name: "Play with friends" }).click();
  await host.page.getByRole("button", { name: "4", exact: true }).click();
  await expect(host.page.getByText("4 players, 6 cards each.")).toBeVisible();
  await host.page.getByRole("button", { name: "Next", exact: true }).click(); // players → rules
  await expect(host.page.getByText("Naija Standard")).toBeVisible();
  // House rule: decking (same number). Players and bots deck whenever they can.
  await host.page.getByRole("switch", { name: "Decking" }).click();
  await expect(host.page.getByText("Same number: 4 triangle")).toBeVisible();
  await host.page.getByRole("button", { name: "Next", exact: true }).click(); // rules → seats
  await host.page.getByText("Easy", { exact: true }).click();
  await host.page.getByRole("button", { name: "Next", exact: true }).click();
  await host.page.getByRole("button", { name: "Create room" }).click();
  await expect(host.page.getByText("Room code", { exact: true })).toBeVisible({ timeout: 20_000 });
  const code = host.page.url().split("/r/")[1]!;

  await guest.page.goto(`/r/${code}`);
  await expect(guest.page.getByText(/Waiting for @/)).toBeVisible({ timeout: 20_000 });
  await host.page.getByRole("button", { name: "Start game · bots take 2 seats" }).click();

  const pages = [host.page, guest.page];
  for (const p of pages)
    await expect(p.getByRole("group", { name: /Your hand, 6 cards/ })).toBeVisible();
  await test
    .info()
    .attach("whot-start", { body: await host.page.screenshot(), contentType: "image/png" });

  // Each player: say Last card when offered, else play the first playable card
  // (calling Circle after a Whot), else go to market. Until both see the result.
  const result = (p: Page) => p.getByRole("dialog").filter({ hasText: /won|tied/ });
  const deadline = Date.now() + 200_000;
  let shotMid = false;
  let shotDeck = false;
  while (Date.now() < deadline) {
    if ((await Promise.all(pages.map((p) => result(p).isVisible()))).every(Boolean)) break;
    for (const p of pages) {
      const quick = { timeout: 800 };
      if (!shotDeck && (await p.getByRole("button", { name: "Done", exact: true }).isVisible())) {
        shotDeck = true;
        const path = test.info().outputPath("whot-deck-open.png");
        await p.screenshot({ path });
        await test.info().attach("whot-deck-open", { path, contentType: "image/png" });
      }
      const tap = (l: ReturnType<Page["getByRole"]>) =>
        l
          .click(quick)
          .then(() => true)
          .catch(() => false);
      const lastCard = p.getByRole("button", { name: "Last card" });
      if (
        (await lastCard.isVisible()) &&
        (await lastCard.isEnabled({ timeout: 200 }).catch(() => false))
      ) {
        await tap(lastCard);
        continue;
      }
      const hand = p.getByRole("group", { name: /Your hand/ });
      const playable = hand.locator('button:enabled:not([aria-label$="(can\'t play)"])');
      if ((await playable.count()) > 0 && (await tap(playable.first()))) {
        const circle = p.getByRole("button", { name: "Circle", exact: true });
        if (await circle.isVisible().catch(() => false)) await tap(circle);
      } else {
        const market = p.getByRole("button", { name: /market/i }).and(p.locator(":enabled"));
        if ((await market.count()) > 0) await tap(market.first());
      }
    }
    if (!shotMid) {
      shotMid = true;
      await test
        .info()
        .attach("whot-mid", { body: await guest.page.screenshot(), contentType: "image/png" });
    }
    await host.page.waitForTimeout(250);
  }
  for (const [i, p] of pages.entries()) {
    if (!(await result(p).isVisible())) {
      await test
        .info()
        .attach(`whot-player-${i}`, { body: await p.screenshot(), contentType: "image/png" });
    }
  }
  for (const p of pages) await expect(result(p)).toBeVisible();
  await test
    .info()
    .attach("whot-end", { body: await host.page.screenshot(), contentType: "image/png" });
  await expect(result(host.page).getByText("1st", { exact: true })).toBeVisible();
  for (const c of [host.ctx, guest.ctx]) await c.close();
});

test("Ludo: 2 people and 2 bots play, and a player who drops mid-move gets the same board back", async ({
  browser,
}) => {
  test.setTimeout(360_000); // bots take ~3 s a turn (Phase 4 pacing)
  const host = await player(browser, "ludo_h");
  const guest = await player(browser, "ludo_g");

  const tile = host.page.locator("li").filter({ hasText: "Ludo" });
  await tile.getByRole("button", { name: "Play with friends" }).click();
  await host.page.getByRole("button", { name: "4", exact: true }).click();
  await host.page.getByRole("button", { name: "Next", exact: true }).click(); // players → rules
  await expect(host.page.getByText("Naija Standard")).toBeVisible();
  await host.page.getByRole("button", { name: "Next", exact: true }).click(); // rules → seats
  await host.page.getByText("Easy", { exact: true }).click();
  await host.page.getByRole("button", { name: "Next", exact: true }).click();
  await host.page.getByRole("button", { name: "Create room" }).click();
  await expect(host.page.getByText("Room code", { exact: true })).toBeVisible({ timeout: 20_000 });
  const code = host.page.url().split("/r/")[1]!;
  await guest.page.goto(`/r/${code}`);
  await expect(guest.page.getByText(/Waiting for @/)).toBeVisible({ timeout: 20_000 });
  await host.page.getByRole("button", { name: "Start game · bots take 2 seats" }).click();
  for (const p of [host.page, guest.page])
    await expect(p.getByRole("img", { name: "Ludo board" })).toBeVisible();

  // Play: roll when offered, move the first glowing seed. Stop once the guest has a seed out
  // and is choosing a move (or has rolled plenty), to drop them mid-move.
  const seedsOf = (p: Page) => p.getByRole("list", { name: "Seeds" }).innerText();
  let guestRolls = 0;
  let midMove = false;
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline && !midMove) {
    for (const [i, p] of [host.page, guest.page].entries()) {
      const die = p.getByRole("button", { name: "Roll the die" });
      if (await die.isVisible()) {
        if (
          await die.click({ timeout: 800 }).then(
            () => true,
            () => false,
          )
        )
          if (i === 1) guestRolls++;
        continue;
      }
      const seeds = p.getByRole("button", { name: /^Move / });
      if ((await seeds.count()) > 0) {
        if (i === 1 && guestRolls >= 2) {
          midMove = true;
          break;
        }
        await seeds
          .first()
          .click({ timeout: 800 })
          .catch(() => {});
      }
    }
    if (!midMove && guestRolls >= 5) break; // no real choice came up; drop anyway
    await host.page.waitForTimeout(300);
  }
  expect(guestRolls).toBeGreaterThan(0);

  // The guest's phone dies, then comes back within the grace.
  const choosing = midMove;
  const login = await guest.ctx.storageState();
  await guest.ctx.close();
  await expect(host.page.getByText(/Offline|A bot is playing/).first()).toBeVisible({
    timeout: 15_000,
  });
  const back = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL: BASE_URL,
    storageState: login,
  });
  const page = await back.newPage();
  await page.goto(`/r/${code}`);
  await expect(page.getByRole("img", { name: "Ludo board" })).toBeVisible({ timeout: 20_000 });
  // Same board as everyone else (once any playback on either phone has settled).
  await expect
    .poll(async () => (await seedsOf(page)) === (await seedsOf(host.page)), { timeout: 15_000 })
    .toBe(true);
  // Back within the (3 s test) grace, it's still their move; if a bot covered, it's moved on.
  if (choosing && (await page.getByText("Pick a seed to move").isVisible())) {
    await page
      .getByRole("button", { name: /^Move / })
      .first()
      .click();
    await expect(page.getByText("Pick a seed to move")).toBeHidden();
  }
  await host.ctx.close();
  await back.close();
});

test("chess: two people, a premove, and checkmate", async ({ browser }) => {
  const host = await player(browser, "chess_h");
  const guest = await player(browser, "chess_g", { width: 360, height: 640 });
  const shot = async (p: Page, name: string) => {
    const path = test.info().outputPath(`${name}.png`);
    await p.screenshot({ path });
    await test.info().attach(name, { path, contentType: "image/png" });
  };
  await host.page
    .locator("li")
    .filter({ hasText: "Chess" })
    .getByRole("button", { name: "Play with friends" })
    .click();
  await expect(host.page.getByText("Blitz")).toBeVisible();
  await shot(host.page, "chess-rules");
  await host.page.getByRole("button", { name: "Next", exact: true }).click(); // rules → seats
  await host.page.getByText("Seat 1", { exact: true }).click(); // host plays White
  await host.page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(host.page.getByText("Plays White")).toBeVisible();
  await host.page.getByRole("button", { name: "Create room" }).click();
  await expect(host.page.getByText("Room code", { exact: true })).toBeVisible({ timeout: 20_000 });
  const code = host.page.url().split("/r/")[1]!;
  await guest.page.goto(`/r/${code}`);
  await expect(guest.page.getByText(/Waiting for @/)).toBeVisible({ timeout: 20_000 });
  await host.page.getByRole("button", { name: "Start game" }).click();

  const sq = (p: Page, name: string) =>
    p
      .getByRole("group", { name: "Board squares" })
      .getByRole("button", { name: new RegExp(`^${name},`) });
  const move = async (p: Page, from: string, to: string) => {
    // The square buttons sit under the board (for keyboards and screen readers): press them.
    await sq(p, from).press("Enter");
    await sq(p, to).press("Enter");
  };
  await expect(host.page.getByText("Your move", { exact: false })).toBeVisible({ timeout: 15_000 });
  await move(host.page, "f2", "f3");
  await expect(guest.page.getByRole("button", { name: "f3", exact: true })).toBeVisible();
  await move(guest.page, "e7", "e5");
  await expect(host.page.getByRole("button", { name: "e5", exact: true })).toBeVisible();
  await shot(host.page, "chess-mid-pixel7");
  // Black queues the mate while White thinks; it goes as soon as White moves.
  await move(guest.page, "d8", "h4");
  await shot(guest.page, "chess-premove-360");
  await move(host.page, "g2", "g4");
  await expect(guest.page.getByRole("heading", { name: "You won!" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(host.page.getByText("Black wins by checkmate")).toBeVisible();
  await shot(host.page, "chess-result");
  for (const c of [host.ctx, guest.ctx]) await c.close();
});

test("chess: a solo game against the Hard bot (Stockfish locally)", async ({ browser }) => {
  const me = await player(browser, "chess_bot");
  await me.page
    .locator("li")
    .filter({ hasText: "Chess" })
    .getByRole("button", { name: "Play with friends" })
    .click();
  await me.page.getByRole("button", { name: "No clock", exact: true }).click();
  await me.page.getByRole("button", { name: "Next", exact: true }).click(); // rules → seats
  await me.page.getByText("Play a bot", { exact: true }).click();
  await me.page.getByText("Hard", { exact: true }).click();
  await me.page.getByText("Seat 1", { exact: true }).click();
  await me.page.getByRole("button", { name: "Next", exact: true }).click();
  await me.page.getByRole("button", { name: "Create room" }).click();
  await expect(me.page.getByText("Room code", { exact: true })).toBeVisible({ timeout: 20_000 });
  await me.page.getByRole("button", { name: "Start game" }).click();
  const sq = (name: string) =>
    me.page
      .getByRole("group", { name: "Board squares" })
      .getByRole("button", { name: new RegExp(`^${name},`) });
  const moves = me.page.getByRole("list", { name: "Moves" }).getByRole("button");
  for (const [i, [from, to]] of [
    ["e2", "e4"],
    ["g1", "f3"],
    ["f1", "c4"],
  ].entries()) {
    await expect(me.page.getByText("Your move", { exact: false })).toBeVisible({ timeout: 20_000 });
    await sq(from!).press("Enter");
    await sq(to!).press("Enter");
    await expect(moves).toHaveCount(i * 2 + 2, { timeout: 20_000 }); // the bot answered
  }
  await me.ctx.close();
});
