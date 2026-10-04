/** Only same-site paths are allowed as post-login destinations. */
export function safeNext(raw: string | null | undefined, fallback = "/home"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\"))
    return fallback;
  return raw;
}
