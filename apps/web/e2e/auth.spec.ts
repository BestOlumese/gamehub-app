import { expect, test } from "@playwright/test";
import { fillDob, PASSWORD, pickUsername, signUpAndVerify, submitWithTurnstile } from "./flows";
import { ageSessions } from "./db";
import { linkFromEmail, uniqueEmail } from "./mailpit";

const uname = () => `p_${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;

test("sign up, verify email, pick a username, land on home", async ({ page }) => {
  const email = uniqueEmail("signup");
  await signUpAndVerify(page, email);
  await pickUsername(page, uname());

  // Onboarded users are kept off auth pages.
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/home$/);
});

test("under-18s are refused and no account is created", async ({ page }) => {
  const email = uniqueEmail("kid");
  const thisYear = new Date().getFullYear();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await fillDob(page, { day: 1, month: 1, year: thisYear - 15 });
  await submitWithTurnstile(page, "Create account");
  await expect(page.getByRole("heading", { name: "GameHub is for adults (18+)" })).toBeVisible({
    timeout: 20_000,
  });

  // The address is still free: a real adult sign-up with it works.
  await signUpAndVerify(page, email);
});

test("logging in before verifying sends you to the verify screen", async ({ page }) => {
  const email = uniqueEmail("unverified");
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await fillDob(page, { day: 2, month: 3, year: 1990 });
  await submitWithTurnstile(page, "Create account");
  await expect(page).toHaveURL(/\/verify-email/, { timeout: 20_000 });

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/verify-email\?.*from=login/);
  await expect(
    page.getByText("You need to verify your email before you can log in."),
  ).toBeVisible();
});

test("forgot password, reset, log in with the new password", async ({ page }) => {
  const email = uniqueEmail("reset");
  const username = uname();
  await signUpAndVerify(page, email);
  await pickUsername(page, username);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await submitWithTurnstile(page, "Send reset link");
  await expect(page.getByText("Check your email")).toBeVisible({ timeout: 20_000 });

  await page.goto(await linkFromEmail(email, "Reset your GameHub password"));
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  const newPassword = "brand-new-pass-99";
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Password changed")).toBeVisible();

  await page.getByRole("link", { name: "Log in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("protected pages send you to log in and back", async ({ page }) => {
  await page.goto("/settings/account");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Faccount/);
});

test("a room code survives the trip through log in", async ({ page }) => {
  await page.goto("/join");
  await page.getByRole("textbox", { name: "Character 1" }).fill("A");
  await page.keyboard.type("BC234");
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fr%2FABC234/);
});

test("delete account removes it for good", async ({ page }) => {
  const email = uniqueEmail("delete");
  const username = uname();
  await signUpAndVerify(page, email);
  await pickUsername(page, username);

  await page.goto("/settings/account");
  await page.getByRole("button", { name: "Delete account…" }).click();
  await page.getByLabel(`Type ${username} to confirm`).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
});

test("change email: confirm on the new address", async ({ page }) => {
  const email = uniqueEmail("old");
  const newEmail = uniqueEmail("new");
  await signUpAndVerify(page, email);
  await pickUsername(page, uname());

  await page.goto("/settings/account");
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByLabel("New email").fill(newEmail);
  await page.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(page.getByText("Check your new inbox")).toBeVisible();

  await page.goto(await linkFromEmail(newEmail, "Confirm your new GameHub email"));
  await expect(page).toHaveURL(/\/settings\/account\?email=changed/);
  await expect(page.getByText(`Your email is now ${newEmail}.`)).toBeVisible();
});

test("account menu reaches settings, and game preferences stick", async ({ page }) => {
  await signUpAndVerify(page, uniqueEmail("prefs"));
  await pickUsername(page, uname());

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goto("/settings/preferences");
  const motion = page.getByRole("switch", { name: "Reduce motion" });
  await expect(motion).toHaveAttribute("aria-checked", "false");
  await motion.click();
  await expect(motion).toHaveAttribute("aria-checked", "true");
  await page.waitForTimeout(500); // let the save land
  await page.reload();
  await expect(page.getByRole("switch", { name: "Reduce motion" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("security page works long after signing in", async ({ page }) => {
  const email = uniqueEmail("stale");
  await signUpAndVerify(page, email);
  await pickUsername(page, uname());
  // Regression: Better Auth's listSessions needs a sign-in from the last 10 minutes.
  await ageSessions(email, 60);
  // Drop the 5-minute session cookie cache so the server sees the real (old) sign-in time.
  const cookies = await page.context().cookies();
  await page
    .context()
    .clearCookies({ name: cookies.find((c) => c.name.endsWith("session_data"))?.name ?? "" });

  await page.goto("/settings/security");
  await expect(page.getByRole("heading", { name: "Security", exact: true })).toBeVisible();
  await expect(page.getByText("This device")).toBeVisible();
});
