import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Credits",
  description: "The open-source work GameHub's games are built on.",
};

export default function CreditsPage() {
  return (
    <LegalPage title="Credits" updated="9 October 2026">
      <p>GameHub stands on other people&apos;s generous work. Thank you.</p>

      <h2>Chess</h2>
      <ul>
        <li>
          <strong>Chess pieces</strong> by Colin M.L. Burnett (Cburnett), from Wikimedia Commons,
          used under the BSD licence.
        </li>
        <li>
          <strong>chess.js</strong> by Jeff Hlywa and contributors (BSD-2-Clause) checks every move.
        </li>
        <li>
          <strong>Stockfish</strong> by the Stockfish developers (GPL-3.0), in the WebAssembly build
          Stockfish.js by Nathan Rugg and Chess.com, plays the Medium and Hard chess bots. It runs
          only on our server and is never sent to your browser. Its source code is at
          github.com/official-stockfish/Stockfish and github.com/nmrugg/stockfish.js.
        </li>
      </ul>
    </LegalPage>
  );
}
