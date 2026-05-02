# Asset plan — Realty Royale

## TL;DR

This game does NOT need AI-generated illustrations. The original Hasbro Monopoly Deal cards are 95% typography + color band + tiny icon. We can ship polished, IP-safe visuals using:

- **SVG chassis** for every card (rendered as a React component from typed JSON).
- **Phosphor icons** for the small symbology (rent ladder, action glyphs, target reticle).
- **CSS gradients + a single felt-texture data-URI** for the table.
- **Color tokens** in `globals.css` and `cards.ts` driving every color band.

Total external assets: **0**. Total cost: **$0**. Total time: a few focused hours (mostly polish).

If we want to add hero illustrations *later* (e.g. for property cards), the SVG chassis is designed to drop a `<image>` element into the top half of the card without changing card data. That keeps the Midjourney v7 path open as an opt-in upgrade, but it isn't needed to ship.

## What the UI actually needs

### 1. Card faces — driven by `src/components/Card.tsx`

Already in place. Renders four kinds:

- **Money** — green panel, `$NM` glyph, "Bank" label.
- **Property** — color band (top 40%), name, value, rent ladder.
- **Wild2 / Rainbow** — split-color band (2-color) or 10-segment band (rainbow), label.
- **Action** — cream panel, action label (using the IP-safe `ACTION_LABELS` map), value, optional sub-line for Rent.

**Polish remaining (post-MVP):**
- Replace the inline JSX banding with a proper SVG chassis that scales crisply at any size and exports cleanly for share images.
- Add a small Phosphor icon per action card (lockpick for Swipe, exchange-arrows for Tribute, target for Eviction, gift for Tip Jar, signpost for Round Trip, megaphone for Counter, etc.).
- Add a tiny "rent ladder" graphic that highlights the current rung based on group size.
- Card back (deck face) — currently a gradient `<CardBack>`; can be elevated to a stamped logotype.

### 2. Table & board

- **Felt** — radial-gradient on `<body>` from `--color-felt` to `--color-felt-dark`. Already wired in `globals.css`. Could optionally swap for a subtle SVG noise pattern (~2 KB).
- **Round table outline** — Phase 3 will add a CSS-3D ellipse with `transform: perspective(1200px) rotateX(20deg)`. No raster textures needed.
- **Player slot pads** — colored fan-shaped backdrop per player, again CSS gradients.

### 3. Iconography

- **Lucide** is already in `@phosphor-icons/react`'s neighborhood — we shipped Phosphor as the icon dep. Use:
  - `Coins` — money, bank totals
  - `Stack` / `Cards` — hand counts
  - `MapPin` — drop targets
  - `ShieldX` — Just Say No
  - `ArrowsLeftRight` — Forced Deal swap
  - `Lockpick` (or `HandGrabbing`) — Sly Deal / Deal Breaker
  - `Receipt` — Rent
  - `Cake` — Birthday / Tip Jar
  - `House` / `Buildings` — House / Hotel
  - `Compass` — Pass Go
- Icons are inlined SVG components — no asset files.

### 4. Sounds (out of scope for v1, listed for completeness)

If we ever add audio:
- Card flip click (deal / draw)
- Card slap (play to tableau)
- Coin clink (payment)
- Whoosh (action card resolved)
- Trumpet (winner)

Source: freesound.org or kenney.nl (CC0). Total ~30 KB MP3 budget.

## Card-art TODO (only if/when we want hero illustrations)

This is opt-in and **not blocking**. If we eventually want a hero illustration on the top half of property cards (for visual richness, like Hearthstone vs Magic):

| Card | Asset id | Theme prompt sketch |
|---|---|---|
| Brown — Tin Row | `tin-row` | tin-roof shanty row at dawn, muted ochre, isometric watercolor |
| Brown — Dust Lane | `dust-lane` | dusty alley with a single street lamp, sepia |
| Light Blue — Harbor Mist | `harbor-mist` | foggy seaside cottages, pale blue, dawn |
| Light Blue — Cove District | `cove-district` | seaside village, pastel blues |
| Light Blue — Tide Way | `tide-way` | wooden boardwalk over tidepools, blue-green |
| Pink — Rose Quarter | `rose-quarter` | art-deco theater facade, pink neon |
| Pink — Sunset Strip | `sunset-strip` | palm-lined boulevard at dusk, magenta sky |
| Pink — Lilac Walk | `lilac-walk` | cobble walkway under blooming lilacs |
| Orange — Ember Heights | `ember-heights` | hilltop bungalows, orange sunset |
| Orange — Copper Hill | `copper-hill` | copper-roofed market square |
| Orange — Saffron Bay | `saffron-bay` | warm-water marina, golden hour |
| Red — Crimson Court | `crimson-court` | grand red-brick courthouse |
| Red — Vermillion Park | `vermillion-park` | rose garden in vermillion bloom |
| Red — Ruby Mile | `ruby-mile` | art-deco shopping mile, ruby tones |
| Yellow — Goldleaf Plaza | `goldleaf-plaza` | gilded plaza with a clocktower |
| Yellow — Honey District | `honey-district` | warm honey-colored streets, cafe terraces |
| Yellow — Amber Square | `amber-square` | amber-lit nightlife square |
| Green — Verdant Hills | `verdant-hills` | rolling green countryside |
| Green — Mossgate | `mossgate` | moss-covered stone gateway in a forest |
| Green — Pinecrest | `pinecrest` | pine-forested ridge, evergreen |
| Dark Blue — Cobalt Crown | `cobalt-crown` | tower district at twilight, deep cobalt |
| Dark Blue — Sapphire Reach | `sapphire-reach` | grand bridge over a sapphire harbor |
| Railroad — North Line | `north-line` | tracks heading into snowy mountains |
| Railroad — Coastal Line | `coastal-line` | tracks along an ocean cliff |
| Railroad — Iron Line | `iron-line` | freight yard at dawn |
| Railroad — Sky Line | `sky-line` | elevated tracks over a city |
| Utility — Power Grid | `power-grid` | substation under starry sky |
| Utility — Water Grid | `water-grid` | reservoir + pipes |

**Approach if we ever pull the trigger:**

1. Generate one "style anchor" image with an art tool (Midjourney v7, Imagen 4, Flux 1.1 Pro, or whatever's strongest at the time of generation). Use `--sref` (or equivalent style-reference mechanism) to lock the style across all 28 cards.
2. Batch-generate at 512×384 WEBP.
3. Drop into `assets/illustrations/properties/` keyed by `id`.
4. Wire into `Card.tsx`'s property render path: when `assetMap.has(card.id)` is true, swap the color band for an `<image>` element and dim the band into a footer strip.
5. Commit illustrations directly to git; budget ~22 MB total (no LFS needed).

**Cost when we do it:**
- Pick any one: $30/mo Midjourney Pro for a month, or ~$5–10 of Replicate/fal.ai credits for Flux, or ~$10 of Vertex AI for Imagen 4.
- Time: ~1 dedicated day for batch + curation + integration.

**Why we're punting:**
- Risk of style drift across 28 cards.
- Adds ~22 MB to the repo and the page weight.
- The text-and-color chassis is already information-dense; illustrations would need extra real-estate the small mobile card doesn't have.
- Visual identity comes more from the **table feel** (3D perspective, reticle glows, motion polish) than from per-card art. We invest there instead.

## Summary

| Layer | What | Source |
|---|---|---|
| Card faces | SVG chassis, color tokens, typography | `src/components/Card.tsx` + `globals.css` |
| Card icons | Phosphor duotone | `@phosphor-icons/react` |
| Table felt | CSS radial gradient | `globals.css` |
| 3D table | CSS `perspective` + `rotateX` | `src/components/PlayingTable.tsx` (Phase 3) |
| Card back | Gradient + logotype | `Card.tsx` `<CardBack>` |
| Property hero art | (None — punted; see TODO above) | n/a |

We ship without a single external image asset. If/when we want hero art, it slots into the chassis cleanly — no schema or layout changes needed.
