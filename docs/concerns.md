# Concerns & risks

Known risks, what we decided, and what would trigger a change. Keep this file current.

| # | Concern | Impact | Decision / mitigation | Revisit when |
|---|---|---|---|---|
| 1 | **Free-tier daily caps** (Durable Objects: 100k requests, 100k rows written per day) | At ~300–600 games/day, new games fail until 01:00 Lagos time | Write-saving rules + graceful `CAPACITY` message (`13-free-tier-budget.md`) | Daily usage passes ~70 % for a week → consider Workers Paid ($5/mo, needs a card) |
| 2 | **Rooms run in Europe**, not Africa (Cloudflare doesn't place DOs in Africa today) | ~100–150 ms per move from Lagos | Accepted; optimistic UI, dice/card animations hide it; turn-based games tolerate it | Cloudflare adds African DO placement → switch `locationHint` |
| 3 | **Gmail SMTP 500/day** and possible account blocks for "app-like" sending | Sign-ups stall on viral days | Quota guard at 480, resend limits, Google sign-in promoted when quota hit, dedicated Gmail account | Sign-ups regularly > 300/day → move to a free transactional provider tier or Workspace |
| 4 | **Gmail deliverability** (mail from a gmail.com address sent by an app may land in spam) | Users don't find verify email | Clear "check spam" hint on verify page; plain-text part; short subject | Complaints about missing emails |
| 5 | **Age verification is self-declared** (DOB entry). NDPA expects "appropriate mechanisms" to verify age for children's data | Regulatory exposure if minors sign up | 18+ only, terms, DOB gate, delete under-18 accounts, no DOB stored | Before any public promotion: get a short legal review. Not legal advice. |
| 6 | **Neon cold starts** (scale-to-zero after 5 min) | First request after idle a bit slower | Neon touched rarely; pages cached; acceptable | Never critical for gameplay |
| 7 | **Vercel Hobby terms** (personal, non-commercial) | Must stay non-commercial | Free, no monetization — fits | If you ever monetize, move to Pro |
| 8 | **Single global PresenceDO** | Hot spot at scale (~1k req/s soft limit) | Fine for launch | Shard by userId hash when presence messages grow |
| 9 | **Public text chat with strangers** | Harassment, scams | Filter, link/phone masking, reports, auto-mute, admin bans, per-user chat off | Moderation workload too high → default public chat off |
| 10 | **Collusion in multi-player ranked Whot** | Unfair ratings | Quick-match only, pair cap; accepted residual risk | Patterns in reports |
| 11 | **Library API drift** (partyserver/partysocket, Better Auth, openskill, Serwist + Turbopack) | Snippets in these docs may not match | Docs say "verify at install"; pin versions | Each major upgrade |
| 12 | **Snakes classic layout accuracy** | Wrong board | Verify against a reference image before Phase 6 ships | — |
| 13 | **"GameHub" name** is generic and may collide with existing apps/trademarks | Confusion; possible takedown if ever commercial | Keep for free project on free subdomains | Before any branding spend |
| 14 | **No monitoring** | Bugs found only by users | Manual Cloudflare/Vercel dashboard checks; "Report a problem" link that opens a prefilled email | Repeated silent failures |
| 15 | **workers.dev / vercel.app subdomains** | Look less trustworthy; can't share cookies (handled by tickets) | Accepted | Free domain options change |
| 16 | **Framework JS floor** (React + Next.js runtime ≈ 134 KB gzip on every page) | TBT on low-end phones; budgets in `10-performance.md` include it | Budgets raised by the floor in Phase 0; keep our own JS tiny; Lighthouse mobile ≥ 95 is the hard gate | Lighthouse Performance on marketing pages drops below 95 on CI → consider plain static HTML for marketing routes |
