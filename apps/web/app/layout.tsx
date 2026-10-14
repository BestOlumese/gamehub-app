import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { siteUrl } from "@/lib/site";
import "./globals.css";

// Self-hosted (SIL OFL, licences beside the files): builds never fetch Google Fonts, which once
// failed a CI build when the download came back in a form Turbopack couldn't read.
const manrope = localFont({
  src: "./fonts/manrope-latin.woff2",
  weight: "200 800",
  display: "swap",
  variable: "--font-manrope",
});
const bricolage = localFont({
  src: "./fonts/bricolage-grotesque-latin.woff2",
  weight: "600 800",
  display: "swap",
  variable: "--font-bricolage",
});

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: "GameHub — Whot, Ludo and more with your people", template: "%s · GameHub" },
  description:
    "Play Whot, Ludo, Snakes & Ladders, Tic-tac-toe and Rock Paper Scissors with friends, live in your browser. Free.",
  applicationName: "GameHub",
  openGraph: { type: "website", siteName: "GameHub", locale: "en_NG" },
};

export const viewport: Viewport = {
  themeColor: "#0E7A4E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${bricolage.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
