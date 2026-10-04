import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { contactEmail } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What GameHub collects, why, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="4 October 2026">
      <p>
        We keep as little about you as we can. This page explains what we collect, why, who helps us
        run things, and what you can ask us to do. It follows the Nigeria Data Protection Act 2023.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account:</strong> email address, username, and your password (stored only as
          a scrambled hash we can&apos;t read).
        </li>
        <li>
          <strong>If you use Google sign-in:</strong> the name, email and profile photo Google
          shares with us.
        </li>
        <li>
          <strong>Age check:</strong> the date and time you confirmed you&apos;re 18 or older. We
          use your date of birth to check, then throw it away. We never store it.
        </li>
        <li>
          <strong>Games:</strong> the games you play, results, ratings and stats.
        </li>
        <li>
          <strong>Security:</strong> while you&apos;re logged in, your session keeps your IP address
          and browser type, to spot account theft and abuse.
        </li>
        <li>
          <strong>Reports:</strong> if someone reports you, the report and the message it&apos;s
          about.
        </li>
      </ul>
      <p>
        We don&apos;t collect your phone number, location or contacts. We don&apos;t store chat
        messages, except a message that someone reports. There are no ads, no tracking and no
        analytics on GameHub.
      </p>

      <h2>Why we use it</h2>
      <ul>
        <li>
          To run your account and your games (needed to provide the service you signed up for).
        </li>
        <li>
          To keep GameHub safe and fair: stopping cheating, spam and abuse (our legitimate
          interest).
        </li>
        <li>To meet legal duties, like keeping GameHub for adults only.</li>
      </ul>

      <h2>Who helps us run GameHub</h2>
      <p>We never sell your data. These services process it for us, only to run GameHub:</p>
      <ul>
        <li>Vercel (hosts the website)</li>
        <li>Cloudflare (runs the game servers and the &ldquo;are you human&rdquo; check)</li>
        <li>Neon (hosts the database)</li>
        <li>Google (sends our emails through Gmail, and Google sign-in if you use it)</li>
      </ul>
      <p>
        Our servers are in Frankfurt, Germany, so your data is stored outside Nigeria. These
        providers protect it with safeguards recognised under data protection law.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account: until you delete it.</li>
        <li>Login sessions: up to 30 days.</li>
        <li>Records of emails we sent you (with your address scrambled): 30 days.</li>
        <li>
          Game results: when you delete your account, your name is removed and replaced with
          &ldquo;Deleted player&rdquo;, so other people&apos;s game history still makes sense.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We only use the cookies needed to keep you logged in. No tracking or advertising cookies.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see the data we hold about you, correct it, get a copy, or have it deleted,
        and you can object to how we use it. You can delete your account yourself in Settings. For
        anything else, email us. If you&apos;re not happy with our answer, you can complain to the
        Nigeria Data Protection Commission.
      </p>

      <h2>Under 18s</h2>
      <p>
        GameHub is for adults only. If we learn an account belongs to someone under 18, we delete
        it.
      </p>

      <h2>Contact</h2>
      <p>Privacy questions or requests: {contactEmail}.</p>
    </LegalPage>
  );
}
