import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { GamesSection } from "@/components/landing/games-section";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { WhyItWorks } from "@/components/landing/why-it-works";
import { AnkaraStrip } from "@/components/site/ankara-strip";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main>
        <Hero />
        <AnkaraStrip />
        <GamesSection />
        <HowItWorks />
        <WhyItWorks />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
