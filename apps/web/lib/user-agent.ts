/** "Chrome on Android" from a user-agent string. Good enough for a devices list. */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /SamsungBrowser/i.test(ua)
    ? "Samsung Internet"
    : /OPR\/|Opera/i.test(ua)
      ? "Opera"
      : /Edg\//i.test(ua)
        ? "Edge"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/i.test(ua)
            ? "Chrome"
            : /Safari\//i.test(ua)
              ? "Safari"
              : "Browser";
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iPhone"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux"
            : null;
  return os ? `${browser} on ${os}` : browser;
}
