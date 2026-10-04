const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

type Summary = { ID: string; Subject: string; Created: string };

/** Waits for the newest email to `to` with a subject containing `subject`, returns the first link in it. */
export async function linkFromEmail(
  to: string,
  subject: string,
  timeoutMs = 20_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await res.json()) as { messages: Summary[] };
    const hit = messages.find((m) => m.Subject.includes(subject));
    if (hit) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as {
        Text: string;
      };
      const url = /https?:\/\/\S+/.exec(msg.Text)?.[0];
      if (url) return url;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No "${subject}" email for ${to}`);
}

export const uniqueEmail = (tag: string) =>
  `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@test.gamehub.ng`;
