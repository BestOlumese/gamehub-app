# 11 — Design system

**Direction:** light, clean, confident. One strong brand colour, warm neutrals, game pieces carry the colour. Not flashy, not bland, nothing that looks like a default template or AI-generated landing page.

## Principles

1. **Paper, ink, one green.** Warm off-white surfaces, near-black text, deep green for brand and primary actions. Everything else stays quiet so the game pieces pop.
2. **The board is the hero.** Chrome around games is minimal; boards and cards get the colour and motion.
3. **Thumb-first.** All primary actions reachable in the bottom 40 % of the screen on phones. Touch targets ≥ 44 px.
4. **Readable at a glance.** Your turn, the timer and the call card must be readable in under a second.
5. **Plain words.** "Your turn", "Go market", "Pick 2". No marketing fluff, no "Unleash", no "Elevate".

## Colour tokens

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#FAF8F4` | App background |
| `--surface` | `#FFFFFF` | Cards, sheets |
| `--surface-2` | `#F2EFE8` | Inputs, subtle panels |
| `--line` | `#E4DFD4` | Borders, dividers |
| `--ink` | `#1A1C20` | Primary text |
| `--ink-2` | `#55595F` | Secondary text |
| `--ink-3` | `#8A8E94` | Placeholder, disabled (not for body text) |
| `--brand` | `#0E7A4E` | Primary buttons, links, focus ring |
| `--brand-strong` | `#0A5E3C` | Pressed/hover |
| `--brand-soft` | `#E3F2EA` | Selected states, badges |
| `--accent` | `#E6A23C` | Your turn, highlights, wins |
| `--accent-soft` | `#FCF1DD` | Turn banner background |
| `--danger` | `#E05A47` | Penalties, errors |
| `--danger-soft` | `#FBE7E3` | Error backgrounds |
| `--danger-strong` | `#B3392A` | Error text on white/paper (5.6:1). `--danger` is fill-only, with `--ink` text |
| `--info` | `#2F6FD6` | Info only (rare) |

Contrast: `--ink` on `--paper` ≈ 16:1; white on `--brand` ≥ 5:1. Use `--accent` only as a fill/border with `--ink` text on it, never as text on white.

### Game piece colours
| Piece | Colours |
|---|---|
| Ludo red / green / yellow / blue | `#D9473A` / `#1F9D5B` / `#E8B021` / `#2F6FD6` |
| Snakes tokens (8) | the four above + `#8E5BD9` purple, `#E07A2E` orange, `#1AA3A3` teal, `#C2417E` pink — each token also shows the player's initial |
| Whot cards | Classic look: white card, deep maroon `#7A1F2B` shapes and numbers, Whot card with maroon back |
| Board surface | `#FFFDF8` with `--line` grid |

Colour is never the only signal: Ludo yards are labelled, tokens carry initials, Whot shapes are shapes.

## Typography

- UI/body: **Manrope** (variable, 400–800).
- Display (logo, big numbers, game titles): **Bricolage Grotesque** (variable, 600–800).
- Both via `next/font/google`, Latin subset.
- Scale (px): 12 · 14 · 16 (body) · 18 · 22 · 28 · 36 · 48. Line height 1.5 body, 1.15 display.
- Numbers in timers/scores: `font-variant-numeric: tabular-nums`.

## Space, shape, depth

- 4 px base grid: 4, 8, 12, 16, 24, 32, 48.
- Radius: 10 px controls, 16 px cards/sheets, 999 px pills. Playing cards 8 px.
- Shadows: two only — `sm: 0 1px 2px rgb(26 28 32 / .06)` and `lg: 0 8px 24px rgb(26 28 32 / .10)`. Cards in hand use `sm`, lifted card `lg`.
- No gradients on UI chrome. One subtle paper texture allowed on the board only.

## Motion

| Thing | Duration | Easing |
|---|---|---|
| Button press | 80 ms | ease-out |
| Sheet / dialog | 200 ms | cubic-bezier(.2,.8,.2,1) |
| Card play (hand → pile) | 260 ms | same |
| Seed hop | 90 ms per square | ease-in-out |
| Dice roll | 600 ms | custom |
| Turn change highlight | 300 ms | ease-out |

Reduced motion: durations ÷ 3, no bounces, no shaking.

## Core components (`packages/ui`)

Button (primary/secondary/ghost/danger), IconButton, Input, Select (DOB), Sheet (bottom on mobile), Dialog, Toast, Tabs, Avatar (initials fallback, status ring: online green / away amber / bot grey), SeatChip (avatar + name + card count + timer ring), TurnBanner, TimerRing, Countdown, EmoteBar, ChatPanel, RulesSheet (game-specific form), ShareSheet (WhatsApp, copy link, copy code), RoomCodeInput (6 boxes, auto-advance), Leaderboard row, MatchHistory row, Empty state.

Game pieces: WhotCard, WhotHand, WhotPile, ShapePicker, LudoBoard, LudoSeed, Die, SnakesBoard, Token, TttGrid, RpsPicker, Bracket.

## Layout

- Mobile first; max content width 1120 px on desktop.
- Game screen (portrait): top bar (room code, menu, connection dot) → opponents row → board → your area (hand / seeds / buttons) → emote bar. No page scroll during play.
- Landscape and desktop: board centred, chat panel on the right.

## Voice & copy

| Do | Don't |
|---|---|
| "Your turn" | "It's your time to shine!" |
| "Tunde is offline (0:42)" | "Connection lost for user" |
| "Pick 4 or defend" | "A penalty has been applied" |
| "Room full" | "Oops! Something went wrong 😅" |

## Brand

- Name: **GameHub** (wordmark in Bricolage Grotesque 800, "Game" in ink, "Hub" in brand green).
- Mark: a simple rounded square split into four quadrants (nod to the Ludo board) with one quadrant in brand green. SVG, works at 16 px.
- Favicon/PWA icon from the mark.

## Marketing and auth pages (decided Oct 2026)

- **Feel:** "warm Naija table". Paper background, drawn game pieces, and an Ankara-inspired geometric repeat used sparingly: behind the hero art, on the auth brand panel, and as thin divider strips.
- **Landing:** hero with game-table art (Whot hand, Ludo board, dice, seeds) and "Your games. Your people. No wahala."; buttons "Play free" (→ sign up) and "I have a room code" (→ `/join`). Then: The games (5 tiles, Whot tile wide), How it works (3 steps), Built for real phones and networks (4 points), FAQ (native `<details>`), closing "Your table is waiting." band.
- **Auth:** split screen on laptops (form left, green brand panel right with the table art and a line that changes per page); phones get the form only. Google button on top. Sign-up is one page: email, password (show/hide + live "at least 8 characters" tick, no confirm box), date of birth as Day/Month/Year native selects. Verify screen: envelope art, "Open Gmail" for Gmail addresses, spam hint, 60 s resend countdown, "Wrong email? Start again".
- **Onboarding:** username with live availability check and 3 tap-to-use suggestions. Google users see a date-of-birth step first ("Step 1 of 2").
- **Art pipeline:** drawings are React components in `packages/ui/src/art`. Decorative ones are exported to `apps/web/public/art/*.svg` with `pnpm art` (committed; a unit test fails if they drift) and shown with `<img>`, so they're cached once and kept out of page HTML/RSC payloads. The pattern is a CSS background (`bg-ankara`, `bg-ankara-brand`).
