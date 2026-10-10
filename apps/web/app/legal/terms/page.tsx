import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { contactEmail } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The rules for using GameHub, in plain English.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="10 October 2026">
      <p>
        These terms are the deal between you and GameHub. They&apos;re written to be read. By
        creating an account you agree to them.
      </p>

      <h2>What GameHub is</h2>
      <p>
        GameHub is a free website for playing Whot, Ludo, Snakes &amp; Ladders, Chess, Draughts,
        Naija Plots, Tic-tac-toe and Rock Paper Scissors with other people online. It&apos;s a
        non-commercial project. There are no coins, no purchases, no ads and no prizes.
      </p>

      <h2>You must be 18 or older</h2>
      <p>
        GameHub is for adults only. When you sign up you confirm that you are at least 18. If we
        find out an account belongs to someone under 18, we delete it.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>One account per person. Keep your password to yourself.</li>
        <li>
          Your username must not be offensive, and must not pretend to be someone else or to be
          GameHub staff.
        </li>
        <li>You&apos;re responsible for what happens on your account.</li>
      </ul>

      <h2>Play fair</h2>
      <p>Don&apos;t:</p>
      <ul>
        <li>use bots, scripts or tools that play or help you play;</li>
        <li>exploit bugs, or try to see other players&apos; cards;</li>
        <li>
          team up with others in a game to beat everyone else, or lose on purpose to boost
          someone&apos;s rating;
        </li>
        <li>make extra accounts to get around a suspension or to play yourself.</li>
      </ul>

      <h2>Be decent in chat</h2>
      <p>
        No harassment, threats, hate, sexual content, scams, spam, or sharing anyone&apos;s personal
        details. Players can mute, block and report you. Moderators can mute, suspend or ban
        accounts that break these rules.
      </p>

      <h2>No betting</h2>
      <p>
        GameHub has no money in it, and you must not use it for gambling or betting of any kind,
        including bets arranged outside the site.
      </p>

      <h2>Real footballers in Football Draft</h2>
      <p>
        Football Draft uses real footballers&apos; names and public facts about them, like their
        positions, nationality, clubs and achievements. The ratings are our own opinion. We
        don&apos;t use photos, club badges, kits or league logos. GameHub isn&apos;t affiliated with
        or endorsed by any player, club, league, federation, EA Sports or FIFA.
      </p>
      <p>
        If you&apos;re a player, or you represent one, and want to be taken out, email{" "}
        {contactEmail}. We remove the player in the next data update, within 14 days.
      </p>

      <h2>The service</h2>
      <p>
        We work hard to keep GameHub running, but it&apos;s provided as it is. It may be slow, go
        down, hit its daily limits, or change. We can add, change or remove games and features. As
        far as Nigerian law allows, we aren&apos;t liable for losses from using or not being able to
        use GameHub.
      </p>

      <h2>Leaving, and suspensions</h2>
      <p>
        You can delete your account at any time from Settings. We can suspend or close accounts that
        break these terms.
      </p>

      <h2>Your data</h2>
      <p>
        How we handle your information is explained in our{" "}
        <Link href="/legal/privacy">privacy policy</Link>.
      </p>

      <h2>Changes</h2>
      <p>
        If we change these terms in a way that matters, we&apos;ll show a notice on the site before
        the change takes effect. These terms are governed by the laws of the Federal Republic of
        Nigeria.
      </p>

      <h2>Contact</h2>
      <p>Questions about these terms: {contactEmail}.</p>
    </LegalPage>
  );
}
