import { expect, type Page } from "@playwright/test";
import { linkFromEmail } from "./mailpit";

export const PASSWORD = "ludo-and-whot-2026";

/** Submits a Turnstile-protected form; clicks again only if it was sent before the token arrived. */
export async function submitWithTurnstile(page: Page, button: string) {
  for (let i = 0; i < 10; i++) {
    await page.getByRole("button", { name: button }).click();
    const waiting = page.getByText("One moment, we're checking you're not a robot.");
    if (!(await waiting.isVisible({ timeout: 1_000 }).catch(() => false))) return;
    await page.waitForTimeout(1_000);
  }
  throw new Error("Turnstile never produced a token");
}

export async function fillDob(page: Page, d: { day: number; month: number; year: number }) {
  await page.getByLabel("Day").selectOption(String(d.day));
  await page.getByLabel("Month").selectOption(String(d.month));
  await page.getByLabel("Year").selectOption(String(d.year));
}

/** Signs up with email, verifies via Mailpit, and lands on the username step. */
export async function signUpAndVerify(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await fillDob(page, { day: 14, month: 6, year: 1996 });
  await submitWithTurnstile(page, "Create account");
  await expect(page).toHaveURL(/\/verify-email/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  const link = await linkFromEmail(email, "Verify your GameHub email");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
  await page.getByRole("link", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Pick your username" })).toBeVisible();
}

export async function pickUsername(page: Page, username: string) {
  await page.getByLabel("Username").fill(username);
  await expect(page.getByText("Nice, that one's free.")).toBeVisible();
  await page.getByRole("button", { name: "Start playing" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: new RegExp(`@${username}`) })).toBeVisible();
}
