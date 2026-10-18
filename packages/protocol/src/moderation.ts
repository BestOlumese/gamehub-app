// Chat and name moderation (docs/09-chat-moderation.md). Server-only: the Worker filters chat,
// web checks usernames. Not exported from the package root, so clients never load the lists.
import {
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
  RegExpMatcher,
  TextCensor,
} from "obscenity";
import { CHAT_MAX } from "./chat";

/**
 * Nigerian slurs and vulgar slang that English lists miss (for usernames: matched as whole
 * `_`/digit-separated parts so names like "okoro" or "tototo_fan" aren't caught).
 */
export const NAIJA_WORDS = [
  "ashawo",
  "ashewo",
  "olosho",
  "oloriburuku",
  "werey",
  "were",
  "mumu",
  "ode",
  "toto",
  "oko",
  "nyash",
  "dindin",
  "ewu",
  "agbaya",
  "oloshi",
  "obo",
  "gbola",
  "kpekus",
  "afang",
  "yansh",
  "olodo",
  "ole",
  "akpi",
  "anuofia",
  "onye_ara",
  "ewo",
  "efulefu",
];

/**
 * In chat, only the words that are insults wherever they appear ("were", "ode", "ole", "oko"
 * are everyday English and Yoruba in a sentence).
 */
const CHAT_NAIJA = [
  "ashawo",
  "ashewo",
  "olosho",
  "oloshi",
  "oloriburuku",
  "werey",
  "mumu",
  "toto",
  "nyash",
  "yansh",
  "agbaya",
  "gbola",
  "kpekus",
  "olodo",
  "anuofia",
  "onye ara",
  "efulefu",
];

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const censor = new TextCensor().setStrategy(asteriskCensorStrategy());
const NAIJA_RE = new RegExp(`\\b(${CHAT_NAIJA.join("|").replace(/ /g, "\\s+")})\\b`, "gi");

/** Usernames: English profanity, or a Naija word as one of its parts. */
export function isOffensiveName(name: string): boolean {
  if (matcher.hasMatch(name.replace(/_/g, " "))) return true;
  const parts = name.split(/[_0-9]+/).filter(Boolean);
  if (parts.some((p) => NAIJA_WORDS.includes(p))) return true;
  if (NAIJA_WORDS.some((w) => w.includes("_") && name.includes(w))) return true;
  return NAIJA_WORDS.filter((w) => w.length >= 6 && !w.includes("_")).some((w) => name.includes(w));
}

export type CleanChat =
  { ok: true; text: string; censored: boolean } | { ok: false; reason: "EMPTY" | "LINK" };

// Links: a scheme, www., or a word.tld with a common ending.
const LINK_RE =
  /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ng|net|org|io|co|me|ly|app|xyz|info|biz|gg|link|site|online)\b)/i;
// 10 or more digits, allowing spaces, dashes, dots and a leading +.
const PHONE_RE = /\+?\d(?:[\s.-]?\d){9,}/g;

/**
 * Chat text as everyone else will see it: one line, normalised, at most 200 characters, no
 * links (refused), phone numbers masked, insults starred out (not refused).
 */
export function cleanChat(raw: string): CleanChat {
  const text = raw
    .normalize("NFC")
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, CHAT_MAX);
  if (!text) return { ok: false, reason: "EMPTY" };
  if (LINK_RE.test(text)) return { ok: false, reason: "LINK" };
  let out = text.replace(PHONE_RE, (m) => m.replace(/\d/g, "•"));
  const matches = matcher.getAllMatches(out, true);
  let censored = matches.length > 0;
  if (censored) out = censor.applyTo(out, matches);
  out = out.replace(NAIJA_RE, (m) => {
    censored = true;
    return "*".repeat(m.length);
  });
  return { ok: true, text: out, censored };
}
