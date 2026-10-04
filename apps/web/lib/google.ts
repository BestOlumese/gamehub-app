/** Google sign-in shows only when both keys are configured. Read at build time. */
export const googleSignInEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);
