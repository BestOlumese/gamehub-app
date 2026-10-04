export type EmailKind = "verify" | "reset" | "email-change";

type Template = { subject: string; heading: string; body: string; button: string; expiry: string };

const copy: Record<EmailKind, Template> = {
  verify: {
    subject: "Verify your GameHub email",
    heading: "Confirm your email",
    body: "Tap the button to confirm this is your email and finish setting up your GameHub account.",
    button: "Verify email",
    expiry: "This link expires in 24 hours.",
  },
  reset: {
    subject: "Reset your GameHub password",
    heading: "Reset your password",
    body: "Someone asked to reset the password for your GameHub account. If that was you, tap the button to choose a new one.",
    button: "Choose a new password",
    expiry: "This link expires in 1 hour. If you didn't ask for this, you can ignore this email.",
  },
  "email-change": {
    subject: "Confirm your new GameHub email",
    heading: "Confirm your new email",
    body: "Tap the button to use this address for your GameHub account.",
    button: "Confirm new email",
    expiry: "This link expires in 24 hours. If you didn't ask for this, you can ignore this email.",
  },
};

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

/** Plain, light, branded. Table layout + inline styles because email clients are old. */
export function renderEmail(kind: EmailKind, url: string) {
  const t = copy[kind];
  const href = escape(url);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${t.subject}</title></head>
<body style="margin:0;padding:0;background:#FAF8F4;font-family:Manrope,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1A1C20">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F4;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
<tr><td style="padding:0 4px 20px;font-size:22px;font-weight:800;letter-spacing:-0.02em">Game<span style="color:#0E7A4E">Hub</span></td></tr>
<tr><td style="background:#FFFFFF;border:1px solid #E4DFD4;border-radius:16px;padding:32px 28px">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">${t.heading}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#55595F">${t.body}</p>
<a href="${href}" style="display:inline-block;background:#0E7A4E;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:10px">${t.button}</a>
<p style="margin:24px 0 0;font-size:14px;line-height:1.5;color:#55595F">${t.expiry}</p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#8A8E94;word-break:break-all">Button not working? Paste this link into your browser:<br>${href}</p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;color:#8A8E94">GameHub is free to play and for adults 18 and over.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${t.heading}\n\n${t.body}\n\n${url}\n\n${t.expiry}\n\nGameHub`;
  return { subject: t.subject, html, text };
}
