import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env";
import { addressThrottle, logEmail, quotaReached } from "./log";
import { renderEmail, type EmailKind } from "./templates";

let transport: Transporter | null | undefined;

function getTransport(): Transporter | null {
  if (transport !== undefined) return transport;
  const e = env();
  if (e.SMTP_URL) {
    transport = nodemailer.createTransport(e.SMTP_URL);
  } else if (e.GMAIL_USER && e.GMAIL_APP_PASSWORD) {
    transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: e.GMAIL_USER, pass: e.GMAIL_APP_PASSWORD },
      pool: false, // serverless: one connection per send
    });
  } else {
    transport = null;
  }
  return transport;
}

const fromAddress = () => `GameHub <${env().GMAIL_USER ?? "no-reply@gamehub.local"}>`;

/**
 * Sends one auth email. Never throws: callers run it in `after()` so the HTTP
 * response doesn't wait on SMTP (and can't leak timing).
 */
export async function sendEmail(kind: EmailKind, to: string, url: string): Promise<void> {
  try {
    if (await quotaReached()) {
      await logEmail(kind, to, "skipped_quota");
      return;
    }
    // Sign-in attempts by unverified users also trigger "verify" sends; keep them throttled.
    if (kind === "verify" && (await addressThrottle(kind, to))) return;

    const t = getTransport();
    const { subject, html, text } = renderEmail(kind, url);
    if (!t) {
      if (process.env.NODE_ENV === "production") throw new Error("No mail transport configured");
      console.info(`[email:${kind}] to=${to}\n${url}`);
      return;
    }
    await t.sendMail({ from: fromAddress(), to, subject, html, text });
    await logEmail(kind, to, "sent");
  } catch (e) {
    console.error(`[email:${kind}] failed`, e instanceof Error ? e.message : e);
    await logEmail(kind, to, "failed").catch(() => {});
  }
}
