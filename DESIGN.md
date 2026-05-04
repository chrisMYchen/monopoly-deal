# Design System — Realty Royale

The single source of truth for visual decisions. Read this before adding UI, picking colors, or wiring animations. Code in `src/app/globals.css`, `src/app/layout.tsx`, and `src/components/tokens/index.tsx` implements this system.

## Product context

- **What this is:** a friendly Monopoly Deal clone for online play with friends.
- **Who it's for:** people who'd play a board game with friends but want it on a phone in 10 minutes.
- **Space:** card games (Balatro, Hearthstone, NYT Games) crossed with the heritage Monopoly IP.
- **Project type:** mobile-first web app with online multiplayer (`/r/?code=XXXX`).
- **Memorable thing:** *NYT Games Strands sleekness, but it really feels like Monopoly IP made it. Sparks joy in micro-interactions and what you're accomplishing.*

Every decision below serves that memorable thing. When in doubt, pick the option that lands closer to NYT Strands than to Monopoly Go.

## Aesthetic direction

- **Direction:** Editorial-felt. NYT Games Strands × Balatro card tactility × canonical Monopoly IP, in that order of priority.
- **Decoration level:** minimal. Typography, canon color, and the felt panel do the work.
- **Mood:** reading the NYT on a Sunday, with a deck of canonical Monopoly cards on the table. Calm chrome, tactile cards, single signature color.
- **Reference points:** NYT Strands / Connections / Wordle (chrome grammar), Balatro (card-as-hero discipline), the original Monopoly board (color canon, condensed-caps property type, 8 metal pieces).

The product expresses Monopoly IP **better than the official Monopoly digital products** by going back to the boardgame's actual visual language (color-coded property bands, canonical pieces, editorial typography) instead of casino-mobile cliches.

## Surfaces

NYT Games grammar. The room/lobby chrome is mostly white. The game lives in a bounded felt panel inside that chrome. Felt does **not** flood the viewport.

| Token | Hex | Use |
|-------|-----|-----|
| `--color-bg` | `#FAFAF7` | warm near-white room canvas. Body background. |
| `--color-card` | `#FFFFFF` | paper panels, dialogs, lobby cards. |
| `--color-tint` | `#F2F1EC` | recessed wells: segmented controls, log strips. |
| `--color-felt` | `#1B5E40` | deep card-table green. Game area only. |
| `--color-felt-edge` | `#134730` | inset rim shadow on the felt panel. |

Utility classes in `globals.css`:
- `.surface-paper` — flat white panel, 1px ink border, no shadow.
- `.surface-tint` — recessed warm-white well.
- `.surface-felt` — bounded green panel with `--shadow-felt-rim` inset.
- `.surface-inked` — solid felt with on-dark text, no rim.

**Discipline:** chrome stays flat. Cards are the only thing in the app that gets a real drop shadow. If you're adding `box-shadow` to a panel, you're probably wrong.

## Ink

| Token | Hex | Use |
|-------|-----|-----|
| `--color-ink` | `#111111` | primary text, icons. |
| `--color-ink-soft` | `#5A5A5A` | secondary labels, helper text. |
| `--color-ink-faint` | `#9A9A9A` | tertiary, timestamps, faint dividers. |
| `--color-ink-on-dark` | `#FFFFFF` | text on felt or accent. |

## Color

**Approach:** restrained. ONE accent color does all the brand work.

- **Accent:** `#D9242A` (canonical Monopoly red). Single accent for the whole app: turn pulse, set-complete flash, primary CTA, active-state borders, error severity. Use sparingly so it stays loud.
  - Hover/press: `#B61F23` (`--color-accent-deep`).
  - Wash: `#FCE6E7` (`--color-accent-tint`) for soft red backgrounds (banner fills, alert wells).
- **Functional:**
  - Success: `#1F7A4D` (`--color-success`). Deeper than the felt; reads as confirm, not as table felt.
  - Warning: `#B58A00` (`--color-warning`). Reserved for non-error attention. Do **not** use yellow on chrome glow or success.

### Property set canon — DO NOT TOUCH

These are half the Monopoly IP. They are canonical and locked.

| Set | Hex | Set | Hex |
|-----|-----|-----|-----|
| Brown | `#8B5A2B` | Red | `#CC2E2E` |
| Light blue | `#6FB6D9` | Yellow | `#E6B82A` |
| Pink | `#D9568F` | Green | `#2C8E50` |
| Orange | `#ED7C2A` | Dark blue | `#2A4FB0` |
| Railroad | `#1F1F1F` | Utility | `#B0C436` |

### Action card canon — DO NOT TOUCH

| Card | Hex |
|------|-----|
| Deal Breaker | `#f5b400` |
| Just Say No | `#d93030` |
| Sly Deal | `#2a89c5` |
| Forced Deal | `#6e3eb0` |
| Debt Collector | `#1d8a4a` |
| Birthday | `#e8579b` |
| Double The Rent | `#1a1a1a` |
| House | `#2f9e57` |
| Hotel | `#d93030` |
| Pass Go | `#d93030` |
| Rent | `#d4a017` |

The yellow on the Rent card is canon and lives on the card face only. It does **not** authorize yellow on chrome.

### Light/dark mode

Light mode only. NYT Games are light-only. A daily-ritual card game wants literacy, not theater. Do not add a dark mode without a real reason.

## Typography

Three fonts, three roles. Loaded via `next/font/google` in `src/app/layout.tsx`.

| Role | Font | CSS var | Why |
|------|------|---------|-----|
| Display / wordmark / titles | **Source Serif 4** | `--font-display` | Editorial heft. Heavy weights for the wordmark and screen titles. **No italics anywhere in the UI.** |
| Body / labels / numerals | **DM Sans** | `--font-sans` | Quiet humanist sans. Tabular-nums for bank totals, rent payments, timers. Pairs with Source Serif 4's warmth. *Replaces Inter.* |
| Card faces | **Anton** | `--font-card` | Condensed caps. Echoes the original Monopoly board's "MEDITERRANEAN AVE" type. Card titles only — never UI labels. |

**Why DM Sans, not Inter:** Inter is the AI-design-tool convergence default. DM Sans hits the same NYT-clean utility brief without the convergence smell, has built-in tabular-nums for the bank/rent UI, and pairs warmly with Source Serif 4. (Geist is the runner-up; not chosen because it's becoming the next convergence default.)

**Font scale (px / rem):**
- Display 1 (wordmark, victory): 32 / 2.0
- Display 2 (screen titles, dialog headers): 24 / 1.5
- Heading: 18 / 1.125
- Body: 14 / 0.875 (tabular for numerals)
- Caption / label: 12 / 0.75
- Card title (Anton): 14-18, letter-spacing 0.02em

**Tabular-nums:** any total, rent, bank balance, timer, or score must use `.tabular` (font-variant-numeric: tabular-nums) so digits don't dance.

## Spacing

- **Base unit:** 4px.
- **Density:** comfortable. Generous on the white canvas; tight inside the felt panel.
- **Scale:** `2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)`

## Layout

- **Mobile-first.** 390×844 (iPhone) is the primary canvas. Test there first.
- **Approach:** chrome is editorial (asymmetric, generous white space, tiny wordmark top-left). Felt panel is grid-disciplined (predictable card grid).
- **Wordmark:** small, top-left, in Source Serif 4. Paired with a sans subline like `Room ABCD · Mon May 4` for daily-ritual feel. Never a giant centered logo.
- **Felt panel:** bounded inside the white canvas, not full-bleed. Generous white margin around it. The bounded green block IS the "color of the day" identity, NYT Strands–style.
- **Footer chrome:** small caps DM Sans labels for tabs (`Bank · Properties · Discard · Log`). Underline the active one with a 1px red mark. No bottom nav bar with icons.
- **Border radius scale:** `sm:4px` (tiles, buttons), `md:8px` (panels), `lg:12px` (cards), `full:9999px` (avatar chips, the YOUR TURN pill).
- **Max content width:** the felt panel, not the page. Page can be the viewport.

## Cards

The card is the only place tactility lives.

- Real drop shadow: `--shadow-card`, `--shadow-card-hover`, `--shadow-card-lift` (already in `globals.css`).
- Border: 1px ink at low opacity; the card face is white.
- Title: Anton condensed caps, 14-18px.
- Property cards: 1-2px canonical color stripe at the top edge of the tile. **The color stripes are non-negotiable** — they are the iconic IP signal that lets a player parse the table at a glance.
- Action cards: full-bleed canon background, white Anton text.
- Wildcards: rendered with both color halves visible. Bank value $0; never bank a wildcard.
- Hover/lift: `transform: translateY(-2px)` + `--shadow-card-hover`. No glow, no pulse on idle hover.

## Tokens (player identity)

Canonical 8 Monopoly pieces as monochrome SVG glyphs (`src/components/tokens/index.tsx`). The token IS the player identity — biggest single IP signal in the app.

- Top hat, scottie, car, boot, battleship, thimble, wheelbarrow, race horse.
- Single-fill, `currentColor`, 24×24 viewbox. No color tinting; the player's accent color lives elsewhere (the chip background, not the glyph).
- Use one token glyph per player chip. Don't sprinkle tokens decoratively — they're identity tags, not decoration.

## Motion — spark-joy event→feel codex

The intent layer. Each game event has a *named feel* to match. Visual animations live in `globals.css` (`rr-pulse`, `rr-set-complete-flash`, `rr-shake`, `rr-count-pulse`, `rr-turn-glow`, `rr-turn-end-sweep`). Audio is procedural Web Audio in `src/lib/animations/audio.ts`. Dispatcher is `src/components/AnimationLayer.tsx` (subscribes to log events via `useGameEvents`). Implementation can tune timings; the **feel** is fixed.

| Event | Feel | Status / wiring |
|-------|------|-----------------|
| Card draw | **Physical thwip** into hand. Card snaps, doesn't slide. Audible. | Shipped — `cardPlay` SFX + deck pulse + handcount pulse + tap haptic + initial-deal `+N` overlay (`AnimationLayer:draw`). |
| Card play (property / money / house) | **Lay flat with weight.** | Shipped — `cardPlay` / `moneyPickup` SFX + tap haptic + `+$N` overlay for big banks (`playProperty`, `playMoney`, `house`, `hotel`, `passGo`). Visual settle bounce *not yet implemented*; LayoutGroup handles position transitions. |
| Wildcard flip / reassign | **Paper flip** between color halves. Audible. Free, unbounded within turn. | Shipped — `wildFlip` SFX (distinct paper-tick pitch lift) + tap haptic on `reassignWild`. Visual flip motion remains aspirational. |
| Bank deposit | **Soft mechanical click.** Money lands flat, not stacked. Quiet, not casino. | Shipped — `moneyPickup` SFX (ascending sine pair) + tap haptic. |
| Rent payment | **Quiet ka-ching.** Coins shift, not a slot machine. | Shipped — `pay` SFX (two metallic ticks) + `+$N` and `−$N` overlays on payer/receiver. |
| Set complete | **Red ring flash + tiles align + confetti.** Punchy on white and felt. | Shipped — `setComplete` SFX (major triad arpeggio) + `rr-set-complete-flash` ring + confetti from set rect + `MONOPOLY!` overlay. |
| Just Say No counter | **Definitive block** — shield clash with checkmark, success-green tone. | Shipped — `clash` SFX + `ShieldClash` overlay. (Codex originally called for paper-stamp metaphor; shield reads cleaner and is the canonical choice.) |
| JSN canceled (your block was overridden) | **Failed block** — shield clash, accent-red tone. | Shipped — `clash` SFX (quieter) + `ShieldClash fail` overlay + `BLOCKED!` text. |
| Hand overflow (>7 at end of turn) | **Gentle lift on the discard prompt.** No shame; acknowledgment. | Shipped — Modal scale-up entry + `handOverflow` SFX (two-note descent) + tap haptic on mount. |
| Steal (Sly Deal / Forced Deal / Deal Breaker) | **Theft swoop** + table shake on Deal Breaker. | Shipped — `theft` SFX + `STEAL!` / `SWAP!` / `DEAL BREAKER!` overlays + confetti on Deal Breaker apply. |
| Turn handoff | **Cool sweep on previous player + warm glow on next.** | Shipped — `rr-turn-end-sweep` + `rr-turn-glow` + `turn` SFX. |
| Your-turn pulse | **Thin red bottom-border pulse.** Quiet but persistent. | Shipped — `rr-pulse`. |
| Count change (cash, plays remaining) | **Bouncy scale-up.** Cubic bezier with overshoot. | Shipped — `rr-count-pulse`. |
| Invalid action | **Short shake.** Acknowledgment without judgment. | Shipped — `rr-shake`. |
| Win | **Triumphant arp + confetti rain + table shake.** | Shipped — `win` SFX (5-note ascending arp + held chord) + success haptic + `winRoll` confetti + `rr-shake`. |

**Easing:** enter (`ease-out`), exit (`ease-in`), move (`ease-in-out`), spark-joy (`cubic-bezier(0.34, 1.56, 0.64, 1)` for overshoot). 

**Duration:** micro 50-100ms (state flips), short 150-250ms (card moves), medium 250-400ms (set-complete, turn glow), long 400-700ms (victory sequences).

**Motion budget:** at most one major animation in flight at a time. Set-complete flash + turn glow can chain, but never overlap with confetti.

**Reduced motion:** all animations respected via `@media (prefers-reduced-motion: reduce)` — already wired. New animations must extend that block.

## Anti-patterns — never ship these

You earned this list the hard way (the editorial-felt redesign was 7+ commits unwinding gold/yellow). Don't pay for it again.

**Color:**
- **No gold or yellow chrome.** The previous design used gold glow on success and turn states; we replaced all of it with red. The only legal yellow is the canonical Rent card face and the canonical yellow property band.
- **No purple or violet anywhere outside the canonical Forced Deal action card** (`#6e3eb0`). No purple gradients, ever.
- **No gradients on chrome, CTAs, or accents.** Flat fills only. Gradients are casino-mobile energy.

**Surface:**
- **No shadows on chrome.** Cards only. If you want depth on a panel, use a 1px ink border at low opacity.
- **No vignettes, no grain, no background textures** on the warm-white canvas. NYT-clean means flat.
- **No full-bleed felt floods.** Felt is a bounded panel inside white chrome, NYT Strands–style.

**Layout:**
- **No 3-column SaaS feature grids** with icons in colored circles. Not this product.
- **No centered-everything pages** with uniform spacing. Use editorial asymmetry: tiny wordmark top-left, content where it makes sense.
- **No casino-mobile chunky CTAs** with rounded gradient buttons. Buttons are quiet text or small pills.
- **No giant illustrated wordmark** crowding the screen. The wordmark is small, top-left, paired with a sans subline.

**Typography:**
- **No Inter as primary body sans** — it's the convergence trap. Use DM Sans.
- **No `system-ui` / `-apple-system` as primary** — that's the "I gave up on typography" signal. We have three real fonts.
- **No italics in UI.** Source Serif 4 carries the editorial voice in roman; italic reads as exception, not convention.
- **No marketing voice** in copy: "Designed for X", "Built for Y", "Powered by Z". Use direct, friendly, specific language.

**Game chrome:**
- **No streaks, daily rewards UI, level-up modals, or progression theater.** This is a friendly card game with friends, not a free-to-play monetization funnel.
- **No casino glow** on wins or set completes. Red ring flash is the canonical celebrate.
- **No purple/violet drop hint** for drag-and-drop targets. Use the accent red.

## Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-04 | Created DESIGN.md from existing editorial-felt system | Capture the system shipped in PR #7 (commits a427aa7 → cdc6a2c) so future Claude sessions follow it instead of reaching for AI defaults. |
| 2026-05-04 | Body sans: Inter → DM Sans | Inter is the AI-design-tool convergence default. DM Sans hits the same quiet-utility brief, ships tabular-nums, pairs warmly with Source Serif 4. Applied in `src/app/layout.tsx` + `src/app/globals.css`. |
| 2026-05-04 | Spark-joy event→feel codex documented; status table reflects reality | Initial draft overstated TODOs — `AnimationLayer` already wires most events. Codex now distinguishes shipped feels from genuinely missing pieces (visual settle, wildcard flip motion). |
| 2026-05-04 | `wildFlip` + `handOverflow` SFX added | Distinct procedural audio for wildcard reassign (paper-tick pitch lift) and end-of-turn discard prompt (two-note descent), replacing the previous generic `cardPlay` reuse. |
| 2026-05-04 | `TableChrome` ritual subline added to `PlayingTable` | Tiny Wordmark + "Room ABCD · Mon May 4" header above the cockpit. NYT Strands daily-puzzle pacing; not sticky so it scrolls away on long tables. |
| 2026-05-04 | Anti-patterns section added (loud) | The editorial-felt redesign cost 7+ commits unwinding gold/yellow chrome. Recording the fight prevents reintroduction. |

## Open work

- [x] Inter → DM Sans (variable axis) swap in `src/app/layout.tsx` and `src/app/globals.css`.
- [x] `wildFlip` and `handOverflow` SFX added; wired into `reassignWild` (with 120ms throttle to coalesce rapid reassigns) and `DiscardToLimitDialog`.
- [x] `TableChrome` ritual subline (`Room ABCD · Mon May 4`) added to `PlayingTable`, mount-gated to avoid hydration flicker and empty-room aria-label.
- [ ] Visual settle-bounce on cards landing in bank/property after play. LayoutGroup handles position; settle wobble would need an `onLayoutAnimationComplete` callback per Card.
- [ ] Visual flip motion on wildcard reassign (rotateY tween on the changed card). SFX is shipped; visual remains aspirational.
- [ ] Consider softening the "Discard N cards" dialog title copy — current reads slightly imperative ("Discard"); a phrase like "End of turn — keep 7" would match the gentle-acknowledgment intent better.
- [ ] `TableChrome` date label uses the device's local time + timezone, so two players in the same room near midnight UTC will see different dates. Acceptable cosmetic looseness for now; if it ever matters, derive from a server-supplied `roomCreatedAt` instead.
- [ ] `DiscardToLimitDialog` `handOverflow` SFX may double-fire if a WS reconnect unmounts/remounts the dialog with the same pending state. The engine emits no log event for "pending → awaitDiscardToLimit"; adding one would let `AnimationLayer` drive this cue with proper dedup.
