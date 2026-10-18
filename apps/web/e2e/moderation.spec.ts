import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { makeAdmin } from "./db";
import { pickUsername, signUpAndVerify } from "./flows";
import { uniqueEmail } from "./mailpit";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const uname = (tag: string) =>
  `${tag}_${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;

async function player(browser: Browser, tag: string) {
  const ctx = await browser.newContext({
    ...devices["Pixel 7"],
    viewport: { width: 360, height: 760 },
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

const chatButton = (p: Page) => p.getByRole("button", { name: /^Chat(, \d+ new)?$/ });

test("chat: an insult is starred, reported with the line, and a ban throws the sender out", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const [a, b] = await Promise.all([player(browser, "md_a"), player(browser, "md_b")]);

  // A makes a Whot room; B comes in by its link.
  const tile = a.page.locator("li").filter({ hasText: "Whot" });
  await tile.getByRole("button", { name: "Play with friends" }).click();
  await a.page.getByRole("button", { name: "4", exact: true }).click();
  await a.page.getByRole("button", { name: "Next", exact: true }).click();
  await a.page.getByRole("button", { name: "Next", exact: true }).click();
  await a.page.getByText("Easy", { exact: true }).click();
  await a.page.getByRole("button", { name: "Next", exact: true }).click();
  await a.page.getByRole("button", { name: "Create room" }).click();
  await expect(a.page.getByText("Room code", { exact: true })).toBeVisible({ timeout: 20_000 });
  const code = /\/r\/([A-Z0-9]+)/.exec(a.page.url())?.[1];
  expect(code).toBeTruthy();
  await b.page.goto(`/r/${code}`);
  await expect(b.page.getByText(/Waiting for @/)).toBeVisible({ timeout: 20_000 });

  // B says something rude; it's starred out for everyone.
  await chatButton(b.page).click();
  const bChat = b.page.getByRole("dialog", { name: "Chat" });
  await bChat.getByRole("textbox", { name: "Message" }).fill("you be mumu");
  await bChat.getByRole("button", { name: "Send" }).click();
  await expect(bChat.getByRole("log")).toContainText("you be ****");
  await bChat.getByRole("button", { name: "Wahala!" }).click();
  await shot(b.page, "chat-sheet-360");

  // A sees the bubble and the unread dot, then reports B from the sheet.
  await expect(a.page.getByRole("button", { name: /^Chat, \d+ new$/ })).toBeVisible({
    timeout: 10_000,
  });
  await chatButton(a.page).click();
  const aChat = a.page.getByRole("dialog", { name: "Chat" });
  await expect(aChat.getByRole("log")).toContainText("you be ****");
  await aChat.getByRole("button", { name: b.username }).first().click();
  await aChat.getByRole("button", { name: "Report…" }).click();
  await aChat.getByRole("radio", { name: "Insults or bullying" }).click();
  await shot(a.page, "chat-report-360");
  await aChat.getByRole("button", { name: "Send report" }).click();
  await expect(aChat.getByText("Report sent. Thanks.")).toBeVisible({ timeout: 10_000 });
  await a.page.keyboard.press("Escape");

  // A is a moderator: the report is waiting, with the verified line; a ban throws B out.
  await makeAdmin(a.username);
  const admin = await a.ctx.newPage();
  await admin.goto("/admin");
  const card = admin.getByRole("listitem").filter({ hasText: `→ @${b.username}` });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toContainText("“you be ****”");
  await expect(card).toContainText("verified");
  await shot(admin, "admin-reports-360");
  await card.getByRole("button", { name: "Forever" }).click();
  await expect(admin.getByText(`→ @${b.username}`)).toHaveCount(0, { timeout: 10_000 });

  await expect(b.page).toHaveURL(/\/banned$/, { timeout: 15_000 });
  await expect(b.page.getByText("Your account is suspended")).toBeVisible();
  // And there's no way back in: the room refuses them a ticket.
  await b.page.goto(`/r/${code}`);
  await expect(b.page).toHaveURL(/\/banned$/, { timeout: 15_000 });
  await Promise.all([a.ctx.close(), b.ctx.close()]);
});
