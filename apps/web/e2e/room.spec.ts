import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { pickUsername, signUpAndVerify } from "./flows";
import { uniqueEmail } from "./mailpit";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const uname = (tag: string) =>
  `${tag}_${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;

async function player(browser: Browser, tag: string) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], baseURL: BASE_URL });
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
  await page.getByRole("button", { name: "Play with friends" }).click();
  if (opts.oneGame) {
    await page.getByText("Custom", { exact: true }).click();
    await page.getByText("1 game", { exact: true }).click();
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();
  if (opts.bot) {
    await page.getByText("Play a bot", { exact: true }).click();
    await page.getByText(opts.bot, { exact: true }).click();
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();
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
  for (let i = 0; i < 30 && !(await result.isVisible()); i++) {
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
