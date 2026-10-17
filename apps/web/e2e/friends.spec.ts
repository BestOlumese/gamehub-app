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

test("friends: A invites B from the lobby, B joins from the toast; C watches without seeing hands", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const [a, b, c] = await Promise.all([
    player(browser, "fr_a", { width: 360, height: 760 }),
    player(browser, "fr_b"),
    player(browser, "fr_c"),
  ]);

  // A adds B and C by username; they accept on their Friends page.
  await a.page.goto("/friends");
  for (const other of [b, c]) {
    await a.page.getByRole("textbox", { name: "Username" }).fill(`@${other.username}`);
    await a.page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(a.page.getByText("Request sent.")).toBeVisible();
  }
  for (const other of [b, c]) {
    await other.page.goto("/friends");
    await other.page.getByRole("button", { name: "Accept" }).click();
    await expect(other.page.getByRole("link", { name: `@${a.username}` })).toBeVisible();
    await other.page.goto("/home");
  }
  await a.page.goto("/friends");
  await expect(a.page.getByText("Online (2)")).toBeVisible({ timeout: 15_000 });
  await shot(a.page, "friends-360");

  // A makes a Whot room for 4 (bots fill) and invites B from the lobby.
  await a.page.goto("/home");
  const tile = a.page.locator("li").filter({ hasText: "Whot" });
  await tile.getByRole("button", { name: "Play with friends" }).click();
  await a.page.getByRole("button", { name: "4", exact: true }).click();
  await a.page.getByRole("button", { name: "Next", exact: true }).click();
  await a.page.getByRole("button", { name: "Next", exact: true }).click();
  await a.page.getByText("Easy", { exact: true }).click();
  await a.page.getByRole("button", { name: "Next", exact: true }).click();
  await a.page.getByRole("button", { name: "Create room" }).click();
  await expect(a.page.getByText("Room code", { exact: true })).toBeVisible({ timeout: 20_000 });
  await a.page.getByRole("button", { name: "Invite friends" }).click();
  const sheet = a.page.getByRole("dialog", { name: "Invite friends" });
  const row = sheet.getByRole("listitem").filter({ hasText: `@${b.username}` });
  await expect(row.getByText("Online")).toBeVisible({ timeout: 10_000 });
  await shot(a.page, "invite-sheet-360");
  await row.getByRole("button", { name: "Invite" }).click();
  await expect(row.getByText("Invite sent.")).toBeVisible();

  // B: the toast on Home; Join takes them straight to their seat.
  const toast = b.page.getByRole("alert").filter({ hasText: `@${a.username} invites you to Whot` });
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await shot(b.page, "invite-toast");
  await toast.getByRole("button", { name: "Join" }).click();
  await expect(b.page.getByText(/Waiting for @/)).toBeVisible({ timeout: 20_000 });
  await a.page.keyboard.press("Escape");
  await a.page.getByRole("button", { name: "Start game · bots take 2 seats" }).click();
  for (const p of [a.page, b.page])
    await expect(p.getByRole("group", { name: /Your hand, \d+ cards?/ })).toBeVisible({
      timeout: 15_000,
    });

  // C sees A playing on Home and watches: the game, but no hand, and A sees one watching.
  await c.page.goto("/home");
  const strip = c.page.getByRole("region", { name: /Friends online/ });
  await expect(strip.getByText("In Whot").first()).toBeVisible({ timeout: 15_000 });
  await strip.getByRole("link", { name: new RegExp(`@${a.username}`) }).click();
  await expect(c.page.getByText(`Watching @${a.username} · Whot`)).toBeVisible({ timeout: 20_000 });
  await expect(c.page.getByRole("group", { name: /Your hand/ })).toHaveCount(0);
  await expect(a.page.getByLabel("1 watching")).toBeVisible({ timeout: 10_000 });
  await shot(c.page, "watching");
  for (const p of [a, b, c]) await p.ctx.close();
});
