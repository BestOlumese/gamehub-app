/** Public production address. Vercel's automatic *.vercel.app names are not canonical. */
const PRODUCTION_URL = "https://gamehub-apps.vercel.app";

/** Absolute origin of the site, for metadata, robots and sitemap. */
export const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_ENV === "production"
      ? PRODUCTION_URL
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"),
);
