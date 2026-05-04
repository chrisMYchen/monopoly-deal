# CLAUDE.md

This file provides guidance to Claude Code when working in this repo. Keep it lean — code-derivable facts belong in the code, not here.

## Project overview

Realty Royale (working title) is a friendly Monopoly Deal clone — a sleek, mobile-first web card game with online multiplayer. A pure TypeScript engine drives the rules; one Cloudflare Durable Object per room is authoritative for game state; the Next.js client is a renderer that talks to the DO over a hibernating WebSocket.

## Tech stack

- **Frontend**: Next.js 15 (App Router, static export), React 19, Tailwind v4, shadcn/ui (Radix), Motion (Framer Motion), dnd-kit, Zustand + Immer
- **Realtime + game logic**: Cloudflare Workers + Durable Objects (one DO per room, hibernating WebSockets, SQLite-backed persistence)
- **Engine**: pure TypeScript in `src/engine/` — no I/O, deterministic via `rng.ts`, shared by client (optimistic UI) and server (truth)
- **Tests**: Vitest for the engine; bun-runner scenario scripts for worker E2E
- **Package manager**: **bun** — do not use npm or pnpm
- **Deploy**: Cloudflare Pages (frontend) + `wrangler deploy` (worker)

## Repo layout

```
src/
  app/                  # Next.js routes (/, /r/?code=XXXX)
  components/           # React UI — GameRoom, PlayingTable, HandView, Dialogs, ...
  engine/               # pure rules engine — no React, no I/O
    cards.ts            # 110-card master deck (assertDeckTotals at module load)
    state.ts            # GameState, Player, PropertySet, Pending union
    reduce.ts           # applyAction(state, action) -> newState (Immer)
    rng.ts              # mulberry32 deterministic shuffle
    project.ts          # ProjectedGameState — hides other players' hands
    autoAction.ts       # turn-timer auto-actions
  lib/                  # gameStore (Zustand), wsClient (reconnect/dedup), identity
worker/
  src/index.ts          # Worker routes + Room DurableObject
  src/protocol.ts       # WebSocket message types (Client/ServerToServer/Client)
  test/scenarios.ts     # multi-player E2E scenarios
```

## Commands

| Command                       | What it does                                  |
| ----------------------------- | --------------------------------------------- |
| `bun run dev`                 | Next.js dev server (port 3000)                |
| `bun run worker:dev`          | Wrangler local Worker + DO (port 8787)        |
| `bun run test`                | Vitest watch                                  |
| `bun run test:run`            | Vitest one-shot                               |
| `bun run typecheck`           | App TypeScript check                          |
| `bun run typecheck:worker`    | Worker TypeScript check                       |
| `bun run test:e2e`            | Worker scenario tests (`bun worker/test/scenarios.ts`) |
| `bun run worker:deploy`       | Deploy Worker + DO to Cloudflare              |

Local dev runs both servers in parallel: terminal A `bun run dev`, terminal B `bun run worker:dev`. The frontend connects to `http://localhost:8787` for the WebSocket.

## Architecture decisions

- **DO is authoritative.** The client renders `ProjectedGameState` and sends `Action`s; never trust client state for legality. The reducer runs server-side and the result is broadcast.
- **Engine is pure on purpose.** Same code runs client (optimistic UI) and server (truth). No `Date.now()`, no `Math.random()`, no I/O — all randomness goes through `rng.ts` so games are reproducible from a seed.
- **Static frontend, stateful backend.** Next.js exports static HTML (Cloudflare Pages); all game state lives in the Worker DO. There are no Next.js API routes — the only server is the Worker.
- **One static room route.** `/r/?code=XXXX` is a query param, not a path segment, so static export works. Don't add dynamic route segments under `/r/`.
- **Optimistic actions are deduped.** Each action carries a `clientActionId`; the DO keeps a 64-entry ring buffer per session and ignores repeats. Required for safe reconnect mid-action — do not remove.
- **Hibernating WebSockets.** The DO can be evicted while idle and woken by the next message or a `setAlarm()` (turn timer). State must round-trip through DO storage; do not assume class-instance fields persist between messages.

## Code conventions

Only the non-default rules — assume Claude knows standard TS/React idioms.

- **Engine purity**: `applyAction(state, action) -> newState`. Never mutate outside Immer drafts. No imports from `react`, `next`, `cloudflare:*`, or anything with side effects.
- **Card data integrity**: `assertDeckTotals()` runs at module load in `cards.ts`. If you change card counts, the assertion fires and the build fails. Update both the data and the assertion together.
- **Names**: internal `ActionKind` keys (`slyDeal`, `dealBreaker`, `justSayNo`) are the engine's source of truth. UI strings live in `ACTION_LABELS` / `ACTION_DESCRIPTIONS`. Use canonical Monopoly Deal names (Boardwalk, Sly Deal, Just Say No) in user-facing copy.
- **Imports**: absolute via `@/*` (e.g. `import type { GameState } from "@/engine/state"`). Use `import type` for type-only imports — `noUncheckedIndexAccess` is on, so guard array access.
- **Commit messages**: short, lowercase scoped prefix — `feat(engine):`, `fix(turn-banner):`, `feat(cards):`. Describe the choice, not the diff. No marketing voice, no robot speak.

## Gotchas

Things that have bitten us or are easy to misread.

- **One set per color, but wildcards may overcomplete.** A Deal Breaker can leave a 4/3 set if a wildcard later reassigns away. See `5a343bc`.
- **Wildcard reassignment is free and unbounded within your turn.** It does not consume a play. See `382607f`.
- **JSN chains are parity-based.** `jsnStack` length even → action goes through; odd → action blocked. Multi-target actions (Birthday, two-color Rent) chain a JSN window per defender via `remainingDemands`.
- **Hand limit is end-of-turn.** Hand can spike above 7 mid-turn (e.g. collecting Birthday payments); the discard prompt fires only at `END_TURN`.
- **Double The Rent costs 2 plays.** Stacking two on a single rent costs 3, ending your turn after.
- **Houses/hotels only on standard-color complete sets.** Not on railroad/utility. Hotel requires a House already on the set.
- **Wildcards have $0 bank value** and cannot be banked at all (rainbow `W10` also can't stand alone in a group).
- **Discard pile is fully public.** Card-counters can see every action that's been spent.
- **Never expose `rngState` to clients.** `project.ts` zeroes it; keep it that way or you leak future shuffles.
- **No undo.** The reducer has no inverse; once an action lands on the DO it's committed. UI flows must confirm before sending irreversible plays.

## Workflow

- For engine changes: write a failing Vitest first (`src/engine/*.test.ts`), then implement, then `bun run test:run`.
- For UI changes: exercise the feature in a browser before declaring done — type checks pass on plenty of broken UIs.
- Run `bun run typecheck && bun run typecheck:worker` before commit.
- Reach for the existing test helpers (`newGame()`, `injectHand()`, `findCard()`) instead of fishing through random draws.

## Boundaries

**Always**
- Use `bun`. Not npm, not pnpm.
- Keep `src/engine/` pure (no I/O, no `Date.now()`, no `Math.random()`).
- Pass non-determinism through `rng.ts`.
- Run both typechecks before commit.

**Ask first**
- Adding dependencies (engine especially — it should stay dependency-free aside from `immer`).
- Changing card counts, `assertDeckTotals()`, or the deck composition in `cards.ts`.
- Changing the WebSocket protocol in `worker/src/protocol.ts` (clients in flight will break).
- Changing the `mulberry32` implementation or `shuffle()` signature — historical games become unreproducible.

**Never**
- Trust client-side game state on the server.
- Expose `rngState` or other players' hands in `ProjectedGameState`.
- Commit `.env*`, `.dev.vars`, or wrangler secrets.
- Add `--no-verify` to git commits or skip CI hooks.

## Skills and plans

Detailed implementation plan: `~/.claude/plans/i-want-to-recreate-humble-pinwheel.md`.

When a user request matches a configured skill, invoke it via the Skill tool as your first action — skills have specialized workflows that beat ad-hoc answers. Common routes:

- Bugs, errors, "why is this broken" → `investigate`
- Ship, deploy, PR → `ship`
- QA the live site → `qa`
- Code review of pending diff → `review`
- Visual audit / design polish → `design-review`
- Architecture review of a plan → `plan-eng-review`
- Brainstorming a new product idea → `office-hours`
- Update docs after shipping → `document-release`

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
