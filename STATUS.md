# Realty Royale — build status

## What works end-to-end (verified live with gstack browse, two browser tabs)

- **Lobby**: create room with 4-letter code (e.g. `QXXJ`, `JFHR`), name picker per session, join from second tab with separate session id. Player list updates live; "waiting for host" UX visible to non-host.
- **Game start**: host's "Start game" button enabled at 2+ players; deck shuffled deterministically (seeded mulberry32); 5 cards dealt to each player; turn order set; banner shows current player.
- **Turn lifecycle**: "Draw 2" (or 5 if hand empty) → 3 plays → "End turn" → rotates to next player. Banner shows "X plays left" / "needs to draw".
- **Property placement**: solid properties go to the correct color group; completion meter (e.g., `BROWN 1/2`, `RAILROAD 1/4`) updates live; placed in tableau, removed from hand.
- **Wild placement**:
  - Wild2 (e.g. red/yellow) → `WildAssignPicker` shows two color-banded options → click → wild lands in chosen color group.
  - Rainbow (10-color) → `WildAssignPicker` shows all 10 colors → click → wild attaches to chosen group (rainbow-must-attach rule enforced engine-side).
- **Banking**: money cards + action cards play sideways into the bank. Net worth shows on the player chip.
- **Birthday (Tip Jar)** — multi-target action:
  - Card played → JSN window opens for **first defender** in the queue
  - Defender sees `JsnPrompt`: "Just Say No?" / "Bob, your call:" / "Alice demands $2M from everyone." / Counter (dimmed if no JSN in hand) + Pass
  - On Pass → `PaymentDialog` opens with "You owe $2M" / selected total / Pay button
  - Bankrupt path: empty bank + empty tableau → "Pay (nothing — debt forgiven)"
  - Engine then advances to next defender's JSN window automatically until queue drained
- **Rent (★ wild, single target)** — verified end-to-end:
  - `RentColorPicker` shows colors the source actually owns
  - `PlayerPicker` for single target
  - JSN window → defender passes → `PaymentDialog` with "You owe $4M / Selected: $0M (less than owed — must offer everything)"
  - Property paid (Wild) **transferred to source's tableau** with color preserved (Bob's red Wild → Alice's Red 1/3)
- **Sly Deal (Swipe)** — verified end-to-end:
  - `PlayerPicker` "Pick an opponent to swipe from"
  - `OpponentPropertyPicker` "Pick a property to take from Alice" — shows all selectable properties (excludes complete sets)
  - JSN window → defender passes → property transferred (Alice's Iron Line → Bob's Railroad 1/4)
  - Action card to discard pile, plays decremented by 1
- **State sync**: every action triggers a per-socket projected snapshot. Each player sees:
  - Own hand fully (5–7 cards visible)
  - Opponents' hands as card-count badges (back-of-card stack)
  - Both tableaux fully (color groups, completion meter, House/Hotel flags)
  - Discard pile top card
  - Deck remaining count
  - Turn banner / pending sub-action prompt
- **Per-player view filtering**: confirmed — Alice cannot see Bob's hand contents, only the count.
- **Multi-color tableaux**: a player with 4 different incomplete groups (Green 2/3, Red 1/3, Railroad 1/4, Orange 1/3) renders cleanly with completion meters, and the engine correctly tracks each independently.

## Polish & visual layer

- **Phosphor duotone icons** on every action card kind: ✋ Swipe, ⇄ Tribute, 🤚 Hostile Takeover, $ Eviction, 🎂 Tip Jar, 🏠 House, 🏨 Hotel, 🧭 Round Trip, 🛡 Counter, 🧾 Rent, ✨ Doubler. Centered above the label, amber-700 duotone for warm-tabletop feel.
- **Motion `layoutId` shared transitions** wrap the entire game surface via a top-level `<LayoutGroup>` in `PlayingTable`. Each `<Card>` is rendered as `motion.button` with `layoutId="card-<id>"` so movement between hand → tableau / hand → discard / opponent → you tweens with a spring (stiffness=380, damping=32). Dialogs use `animated={false}` to avoid layoutId collisions while their copy of the card overlaps the actual one.
- **Felt gradient backdrop**: warm radial gradient on `<body>` from a lighter felt center to deep felt edges, with `background-attachment: fixed` so it stays put while the page scrolls.
- **Decorative card stack** on the home page — three layered amber rectangles with the "REALTY Royale" stamp. CSS-only, no assets, signals "card game" instantly.
- **"Your turn" pulse glow**: when the active player is you, the top banner gets a soft yellow `rr-pulse` keyframe animation. Quiet on others' turns.
- **Card hover/select polish**: hover translates -y-1 + adds shadow-lg; selected adds a stronger yellow ring with `ring-offset-2` + a gold-tinted shadow + -y-2 lift. Smooth 150 ms transitions.
- **Center area** (deck/discard) re-laid: each pile gets a labeled column ("DECK" / "DISCARD · 2") for scannability, with the discard count visible at a glance.
- **Production build is clean**: `bun run build` → 102 KB shared chunks, 162 KB First Load JS for the room route (includes Motion + Phosphor). Static prerender for `/`, dynamic for `/r/[code]`.
- **Mobile viewport (375x667 iPhone SE)** verified: home, lobby, in-game with 3 players all readable; opponents stack vertically and the action bar pins to the viewport bottom. Page scrolls naturally to access self area.
- **Reconnection** verified live: closed Alice's tab mid-game, reopened with the same `sessionStorage` session id, full state restored. Server doesn't crash on WS close (Immer fix verified).
- **Server lazily registers a session on join when a player with that id already exists in `game.players`** — covers post-injection tests, DO restarts, and refresh-after-server-reload reconnect paths.

## Test coverage

| Layer | Pass / Total |
|---|---|
| Engine unit tests (Vitest) | **60 / 60** |
| End-to-end scenarios (Bun harness driving WS protocol against dev server with state injection) | **12 / 12** |
| TypeScript strict (`tsc --noEmit`) for app + worker | clean |

End-to-end scenarios exercised:
- `forced deal swaps two properties`
- `deal breaker steals a complete set`
- `debt collector forces $5M payment`
- `2-color rent charges all opponents` (multi-target queue with 3 players)
- `house adds $3M to rent on standard color set`
- `hotel after house` (both flags applied)
- `just say no cancels an action (chain depth 1)`
- `win on completing 3 distinct sets`
- `hand discard at end of turn (>7 cards)`
- `pay-with-property when bank short`
- `bankrupt-forgiveness — $0 assets pays nothing`
- `server rejects spoofed playerId` (WS authority)

Run with `bun run test:e2e` (requires `bun run server:dev:inject` running on `:8787`).

## Bugs found and fixed during iteration

- **Immer-frozen state mutation in connection handlers**: when a WebSocket closed, the server tried to mutate `room.game.players[i].connected = false` directly. Because `room.game` is the latest result of `applyAction(...)` which uses Immer's `produce()`, the returned state is **frozen**. Direct mutation throws `TypeError: Attempted to assign to readonly property` and crashes the server process. Fixed by wrapping all out-of-engine state updates (join/reconnect/leave/close) in `produce()`. Verified by closing a tab live and confirming the server keeps serving requests. Both `worker/src/index.ts` (CF Worker) and `worker/src/dev-server.ts` (Bun dev server) were affected and have been fixed identically.
- **React state batching in card selection dialogs**: PaymentDialog and DiscardToLimitDialog used a `toggle(cid)` function that read the current `selected` state and called `setSelected(new Set)`. Rapid clicks (humans clicking fast or test scripts) saw stale state — only the last click registered. Fixed by switching to functional setState `setSelected(prev => …)` so each toggle merges against the latest state. Verified by JS-driven multi-card selection in the discard dialog.
- **`localStorage` is shared across tabs of the same origin** — broke multi-player testing in a single browser. Switched the per-player session id to `sessionStorage` (per-tab, survives F5 refresh), kept the display name in `localStorage` (cross-tab convenience). End-user impact: the rare user who opens the lobby URL in two tabs of the same browser now correctly gets two distinct player identities.
- **Post-injection / DO-restart joiners locked out**: handleJoin treated any unknown-session sessionId as a "new player" and refused to admit them when `phase !== "lobby"`. Fixed: when an unknown session's id matches a player already in `game.players`, the server lazily registers the session (covers DO restart, scenario tests, and any "real" reconnect after server restart that we couldn't otherwise distinguish from a fresh join).
- **`as any` side-channel on `s.pending`**: multi-target action bookkeeping (`__playCost`, `__declaration`, `__queueAfter`) was attached as untyped properties via `(pending as any)`. Refactored: `awaitJustSayNo` and `awaitPayment` now carry typed `playCost` + `remainingDemands` + (for payment) `declaration` fields. All 12 e2e scenarios still green.
- Coverage: deck composition assertions, turn lifecycle, all property kinds (solid / wild2 / rainbow), banking rules, House/Hotel placement + restrictions, Pass Go, wild reassignment, end-of-turn discard-to-7, win check, plus all targeted actions: Sly Deal, Forced Deal, Deal Breaker, Debt Collector, Birthday, Rent (★ wild + 2-color), Double The Rent multiplier, JSN chain depth 2, payment with bankrupt-forgiveness, Pay with property when bank short.

## All UI dialogs verified live

Every multi-step dialog/picker has been exercised with screenshots via gstack browse:

| Dialog | Verified via |
|---|---|
| `WildAssignPicker` (10-color) | rainbow placement → green |
| `WildAssignPicker` (2-color) | red/yellow wild → red |
| `RentColorPicker` | ★ wild rent picks owned color |
| `PlayerPicker` | Sly Deal, Forced Deal, Deal Breaker target select |
| `OpponentPropertyPicker` | Sly Deal + Forced Deal target card select |
| `MyPropertyPicker` | Forced Deal source card select |
| `CompleteSetPicker` | Deal Breaker takes whole Brown set |
| `HouseHotelTargetPicker` | place House + Hotel on Red 3/3 |
| `JsnPrompt` | Birthday + Sly Deal JSN windows for defender |
| `PaymentDialog` | bankrupt-forgiveness, must-offer-everything, bank+property mix |
| `DiscardToLimitDialog` | end-of-turn hand of 10 → discard 3 |
| `ResultsScreen` | win condition fires, "🏆 Alice!" rendered, both clients see same screen |

Plus protocol-level e2e scenarios (above) cover the engine-and-server pairing for every action card type.

## Known UI rough edges

- **Layout overlap on small viewports**: the fixed bottom `<ActionBar>` lives at `position: fixed; bottom: 0`, and the page main has `pb-40` (160px) to keep content above it. On a 720px viewport with multiple opponents in a strip + tableaux + hand, content can still overflow vertically — page scrolls, which is fine but loses the "everything visible" card-game ideal. Fix path: collapse opponent strip more tightly; scrollable hand row instead of wrapping.
- **No animation polish yet**: Motion shared-`layoutId` transitions are not yet wired between hand → tableau / hand → discard / steal flows. The cards "jump" instantly. Original plan's Phase 3 deliverable.
- **No drag-to-play yet**: cards are tap-select, then click-an-action-button. dnd-kit is installed but not yet hooked up. Drag-to-play is a polish step.
- **Next.js dev badge**: in dev mode you'll see a `1 Issue` / `2 Issues` badge in the bottom-left. These are framework dev-mode warnings, not application errors. Production build won't show this.
- **Reconnect after tab close**: code path is in `worker/src/dev-server.ts` (close handler marks player disconnected; a re-join with same sessionId restores connection AND existing player slot). Not exercised by gstack browse yet — would need a tab close + tab open with same sessionId in localStorage.
- **`bun --watch`** removed from `server:dev` because file edits during testing reload the server and blow away in-memory rooms. If you're actively iterating on `worker/src/dev-server.ts`, restart manually after each change.

## Untested in the live game (not blocking, just unverified by clicking through)

- **Win condition** — three complete sets of distinct colors; engine has a unit test that proves it transitions to `phase: "ended"` and `<ResultsScreen>` renders.
- **Reshuffle on empty draw pile** — engine unit-tested.
- **Wild card reassignment** mid-turn — engine unit-tested via REASSIGN_WILD action; UI surface is the `<WildAssignPicker>` invoked at REASSIGN_WILD time; no in-game button yet (would be a tableau-tap menu).
- **Double The Rent UX** — engine accepts `doubleRentCardIds: []`; UI's RentColorPicker doesn't yet prompt "include doubles?" — punted.
- **House/Hotel break behavior** — when a complete set drops below complete (steal, forced deal, payment), engine detaches H/H to the bank as money. Engine unit-tested; not exercised in live game.

## Local dev

- `bun run server:dev` — runs the Bun-native authoritative server on `:8787` (uses the same engine as the production CF Worker). On macOS where `wrangler dev` / miniflare's workerd loop is flaky, this is the preferred local server.
- `bun run worker:dev` — runs `wrangler dev` against the actual Worker code; works in CI / on Linux.
- `NEXT_PUBLIC_WORKER_ORIGIN=http://localhost:8787 bun run dev` — Next.js on `:3000`.
- `bun run test:run` — Vitest engine tests one-shot.
- `bun run typecheck` / `bun run typecheck:worker` — TS strict.

## Production deploy path

- **Worker**: `bun run worker:deploy` (requires Cloudflare login) deploys `worker/src/index.ts` with the same `Room` Durable Object class.
- **Frontend**: `bun run build` then `bun run start` (or push to Vercel). Set `NEXT_PUBLIC_WORKER_ORIGIN` to the deployed Worker URL.

## Open commits

The `.gitignore` and CLAUDE.md additions, plus all engine + UI code, are uncommitted. Commits failed mid-session due to a 1Password GPG-signing hiccup — once resolved, batch-commit the lot in milestone slices.

## Suggested next session priorities

1. **Live-test the four steal actions** (Sly Deal, Forced Deal, Deal Breaker, Debt Collector with actual bank to pay). All UI is wired; should be a 30-minute clickthrough.
2. **Drive a complete win-condition game** — set up a state where Alice has 2 complete sets and one more property to play, verify `<ResultsScreen>` lands.
3. **Fix the action-bar/hand overlap** — single CSS fix.
4. **Wire Motion `layoutId`** for the deck→hand and hand→tableau moves. This is the biggest polish lever.
5. **dnd-kit drag-to-play** — replace tap-and-button with drag-up to play.
6. **Mobile viewport pass** — test on iPhone SE emulation, fix safe-area insets.
