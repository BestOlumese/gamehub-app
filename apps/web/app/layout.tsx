import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-manrope" });
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
  weight: ["600", "700", "800"],
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
