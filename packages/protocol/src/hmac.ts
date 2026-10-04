// HMAC-SHA256 over `${ts}.${body}` for web ↔ Worker calls. WebCrypto only, so the
// same code runs in Node (web) and workerd (realtime). No zod: safe anywhere.

const enc = new TextEncoder();
export const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function signBody(secret: string, body: string, ts = Date.now()) {
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(`${ts}.${body}`));
  return { ts: String(ts), sig: toHex(sig) };
}

/** Constant-time check (crypto.subtle.verify) plus a ±5 min freshness window. */
export async function verifyBody(
  secret: string,
  body: string,
  ts: string | null,
  sig: string | null,
  now = Date.now(),
) {
  if (!ts || !sig || !/^\d+$/.test(ts)) return false;
  if (Math.abs(now - Number(ts)) > SIGNATURE_MAX_AGE_MS) return false;
  const bytes = fromHex(sig);
  if (!bytes) return false;
  return crypto.subtle.verify("HMAC", await key(secret), bytes, enc.encode(`${ts}.${body}`));
}
