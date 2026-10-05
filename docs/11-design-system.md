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

## Signed-in chrome and settings (decided Oct 2026)

- **App header:** logo left; on the right a single avatar button with a chevron that opens the account menu (avatar, @username, email · Settings · Terms & privacy · Log out, separated). Keyboard: arrows, Home/End, Escape.
- **Avatar:** Google photo when there is one; otherwise the username's initials ("tunde_o" → "TO") on a game-piece colour derived from the username, with ink text where white would fail contrast.
- **Settings:** left sidebar on laptops (Profile, Account, Security, Game preferences), each section its own URL under `/settings/*`; on phones `/settings` is a list of sections and each section has a "‹ Settings" back link. Sections are grouped cards of rows (label, value, action on the right). No forms on the page: "Change" opens a dialog (centred card on laptops, bottom sheet on phones; native `<dialog>`). Delete account sits alone at the bottom of Account in a red-bordered "Danger zone"; the outline-red button opens a dialog that needs the username typed (and the password, or a fresh Google sign-in).
- **Preferences** save as each switch is flipped and flip back if the save fails.

## Rooms and the game table (decided Oct 2026)

- **Home:** game tiles first (art, name, players); playable games show "Play with friends", others "Soon". Room-code box above the tiles.
- **Create room:** step-by-step sheet with progress dots — Rules (Naija Standard or Custom) → Empty seat (wait for a friend, or play a bot + level) → Review → Create.
- **Lobby:** big room code (tap to copy), "Share on WhatsApp" and "Copy link", seat list (host crown; host can add a bot per empty seat or remove a player), rules summary, sticky Start for the host / "Waiting for @host to start…" for others.
- **Table (portrait):** top bar (Home, code with connection dot, ☰ menu) → opponent card → round label → board → turn banner (accent "Your turn") → your card. Timer ring around the active avatar; away players greyed with an offline countdown; bot badge when a bot covers a seat.
- **Game over:** result card slides up over the final board — "You won!" / "@x won" / "It's a draw", both scores, Rematch (back to the lobby, same room) and Back home.
- **Menu:** Rules of this room, Sound on/off, Share room link, Leave game (confirm; a bot takes the seat mid-game).
- **Connection:** nothing for blips under 3 s; then an amber "Reconnecting… your seat is held for 0:57" bar; after the grace, "A bot is playing for you…".

## Rock Paper Scissors (decided Oct 2026)

- **Art:** drawn objects (grey stone, sheet of paper, red-handled scissors), `ThrowArt` in `@gamehub/ui`. No hand gestures.
- **Duel screen:** opponent card on top, their face-down card (Ankara-pattern back with the logo) with "✓ @x has thrown" / "@x is choosing…", the throw line ("Throw 2", "Paper covers rock. You win the throw"), the score, your card, then three big square throw buttons at the bottom and your seat card.
- **Reveal:** "Rock… Paper… Scissors… Shoot!" beats, then both cards flip together; winner lifts with a green border, loser dims. The score stays hidden until the flip.
- **Setup:** an extra first step "How many players?" (2–8; 2 = duel, 3–8 = knockout).
- **Bracket:** rounds as tabs (Quarter-finals · Semi-finals · Final), one row per match with avatars, scores, a check for the winner, "Live" for matches in progress, "Bye, straight through".
- **Waiting / knocked out:** status card ("You're through to the final", "You have a bye this round", "Knocked out in the semi-finals"), live match cards with thrown ticks and last throws, then the bracket.
- **Results:** podium card (1st with crown icon, 2nd, joint 3rd) and a list for the rest; duels show the two scores. Rematch and Back home.

## Whot (decided Oct 2026)

- **Cards:** classic Nigerian Whot — white face, maroon (`--color-whot`) shape in the centre, number with a small shape in two opposite corners; Whot 20 shows "WHOT". Maroon back with "WHOT" written sideways (`WhotCardBackArt`). Drawn as inline SVG (`components/room/whot/whot-card.tsx`), no image files.
- **Table (portrait):** opponents sit round the table in play order (clockwise from your left), like poker apps in portrait; nobody is ever cut off or scrolled. Seats per opponent count: 2 → top-left, top-right; 3 → left, top, right; 4 → left, top ×2, right; 5 → left, top ×3, right; 6 → two each side + top ×2; 7 → two each side + top ×3. The market and call card sit on a soft oval "table" (`bg-board`) in the middle. Below: event line ("General market!", "@ada picked 2") → turn banner → LAST CARD / Check up pills → your hand → your seat card. Short screens (≤ 700 px tall) tighten the spacing so a 360×640 phone fits without scrolling.
- **Opponent seat:** the player on turn is lifted slightly with their name in an amber pill; people show their draining timer ring, bots (no clock) a spinning "thinking" arc (also in Tic-tac-toe, with "Thinking…"). Avatar, maroon card-count badge on its corner (amber place badge once they're out in Play on), short name ("Bot 2", "@ada"), amber LAST CARD tag, offline / bot-covering icon.
- **2 players:** a full-width face-off card on top (avatar, name, timer, their face-down hand fanned with the count), like Tic-tac-toe.
- **Hand:** overlapping gentle fan, sorted by shape then number. On your turn playable cards lift 6 px and the rest dim to 55 %. Tap a card to play it; a refused tap shakes the hand and says why ("Doesn't match", "Play a star").
- **Penalties:** red "Pick 4" tag on the market and a red banner "Pick 4 or defend with a 2" (or "Pick 4. Tap the market").
- **LAST CARD:** amber pill that pulses while you can declare; turns green with a tick once said.
- **Shape picker:** bottom sheet "Call a shape" with five big shape buttons.
- **Rules sheet:** grouped sections (Dealing, Special cards, Penalties, Last card, Ending) with switches and segmented choices; a strip on top shows "✓ Naija Standard" or "Custom rules · Reset to Naija Standard".
- **Results:** sheet with every place, cards left and hand total; "Market finished. Lowest total wins." when it ended by count. Rematch and Back home.
- **Sound:** short generated WebAudio tones (play, market, special, penalty, last card, your turn, win). Off when the player turned sound off.
- **Bots** in a room with more than one are numbered ("Bot 2 (Hard)").
