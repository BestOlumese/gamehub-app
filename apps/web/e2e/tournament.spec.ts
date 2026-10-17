import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { tournamentMatches, tournamentPlaces } from "./db";
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

test("tournament: 4 people and 4 bots, tables of 4 then a knockout; everyone is sent to their tables and back; results stored", async ({
  browser,
}) => {
  test.setTimeout(480_000);
  // People sign up in parallel (each takes a few seconds with the email round trip).
  const people = await Promise.all([
    player(browser, "tn_h", { width: 360, height: 760 }),
    player(browser, "tn_a"),
    player(browser, "tn_b"),
    player(browser, "tn_c"),
  ]);
  const host = people[0]!;

  // The host sets it up from Home: 8 players, bots fill, RPS tables of 4 then a 1v1 knockout.
  await host.page.getByRole("link", { name: "Set one up" }).click();
  await expect(host.page.getByRole("heading", { name: "New tournament" })).toBeVisible();
  await host.page.getByLabel("Name", { exact: true }).fill("Friday Throws");
  await host.page.getByText("Easy", { exact: true }).click();
  await host.page.getByRole("button", { name: /^1 Whot/ }).click();
  const sheet = host.page.getByRole("dialog");
  await sheet.getByRole("button", { name: /^Rock Paper Scissors/ }).click();
  await sheet.getByRole("button", { name: "Done", exact: true }).click();
  await host.page.getByRole("button", { name: /^2 Chess/ }).click();
  await sheet.getByRole("button", { name: /^Rock Paper Scissors/ }).click();
  await sheet.getByText("1v1 knockout", { exact: true }).click();
  await sheet.getByRole("button", { name: "Done", exact: true }).click();
  await expect(host.page.getByLabel("Players after each stage")).toHaveText("8 → 4 → 1");
  await shot(host.page, "tournament-setup-360");
  await host.page.getByRole("button", { name: "Create tournament" }).click();
  await expect(host.page).toHaveURL(/\/t\/[A-Z2-9]{7}$/, { timeout: 20_000 });
  const code = host.page.url().split("/t/")[1]!;
  await expect(host.page.getByText("Tournament code", { exact: true })).toBeVisible();

  // The others join with the code from Home's join box.
  for (const g of people.slice(1)) {
    await g.page.goto("/home");
    await g.page.getByRole("button", { name: "Got a tournament code?" }).click();
    await g.page.getByRole("textbox", { name: "Character 1" }).fill(code[0]!);
    await g.page.keyboard.type(code.slice(1));
    await g.page.getByRole("button", { name: "Join tournament" }).click();
    await expect(g.page).toHaveURL(new RegExp(`/t/${code}$`));
    await g.page.getByRole("button", { name: "Join tournament" }).click();
    await expect(g.page.getByRole("button", { name: "Leave" })).toBeVisible();
  }
  await expect(host.page.getByText("4/8")).toBeVisible();
  await shot(host.page, "tournament-lobby-360");
  await host.page.getByRole("button", { name: "Start · bots take 4 places" }).click();

  // Everyone is sent to their table (the sheet counts down and goes by itself).
  await expect(host.page.getByRole("dialog", { name: "Your table is ready" })).toBeVisible({
    timeout: 20_000,
  });
  await shot(host.page, "tournament-ready-360");
  const visited = people.map(() => new Set<string>());
  people.forEach((p, i) =>
    p.page.on("framenavigated", (f) => {
      if (f === p.page.mainFrame()) visited[i]!.add(new URL(f.url()).pathname.slice(0, 3));
    }),
  );
  for (const p of people) await expect(p.page).toHaveURL(/\/r\/[A-Z2-9]{6}$/, { timeout: 20_000 });
  await expect(
    host.page.getByText(/^Stage 1 · Rock Paper Scissors · Table [12]$/).first(),
  ).toBeVisible();
  await shot(host.page, "tournament-table-360");

  // Play: everyone throws whenever they can, until every page shows the final places.
  const pages = people.map((p) => p.page);
  const order = ["Rock", "Paper", "Scissors"] as const;
  const turn = pages.map((_, i) => i);
  const done = (p: Page) => p.getByRole("heading", { name: "Final places" });
  const deadline = Date.now() + 360_000;
  let bracketShot = false;
  while (Date.now() < deadline) {
    if ((await Promise.all(pages.map((p) => done(p).isVisible()))).every(Boolean)) break;
    for (const [i, p] of pages.entries()) {
      const btn = p
        .getByRole("group", { name: "Your throw" })
        .getByRole("button", { name: order[turn[i]! % 3]! });
      const ready =
        (await btn.isVisible()) && (await btn.isEnabled({ timeout: 300 }).catch(() => false));
      if (
        ready &&
        (await btn
          .click({ timeout: 1000 })
          .then(() => true)
          .catch(() => false))
      )
        turn[i]!++;
      if (
        !bracketShot &&
        i === 0 &&
        p.url().includes("/t/") &&
        (await p.getByText("Table 2", { exact: true }).first().isVisible())
      ) {
        bracketShot = true;
        await shot(p, "tournament-bracket-360");
      }
    }
    await host.page.waitForTimeout(250);
  }
  for (const [i, p] of pages.entries()) {
    if (!(await done(p).isVisible()))
      await test
        .info()
        .attach(`player-${i}`, { body: await p.screenshot(), contentType: "image/png" });
  }
  for (const p of pages) await expect(done(p)).toBeVisible();
  await shot(host.page, "tournament-finished-360");
  // Each of them went to a table and came back to the tournament.
  for (const v of visited) {
    expect(v.has("/r/")).toBe(true);
    expect(v.has("/t/")).toBe(true);
  }

  // The result reached web: eight places, one champion, and every table's games.
  await expect.poll(async () => (await tournamentPlaces(code)).length, { timeout: 30_000 }).toBe(8);
  const places = await tournamentPlaces(code);
  expect(places.filter((p) => p.place === 1)).toHaveLength(1);
  expect(places.filter((p) => !p.isBot)).toHaveLength(4);
  expect(await tournamentMatches(code)).toBeGreaterThanOrEqual(5);
  for (const p of people) await p.ctx.close();
});
