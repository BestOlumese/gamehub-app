// Rooms post every finished game to web; in tests "web" is http://web.test, which isn't there.
// Answer those posts (tests that look at them wrap fetch again and see them first).
const real = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("http://web.test")) return Response.json({ ok: true });
  return real(input, init);
}) as typeof fetch;
