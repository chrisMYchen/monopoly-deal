# Realty Royale (working title) — friendly Monopoly Deal clone

A sleek, mobile-first web card game with online multiplayer.

## Stack

- **Frontend**: Next.js 15 (App Router) on Vercel; Tailwind v4 + CSS Modules; shadcn/ui (Radix); Motion (Framer Motion) for layout/drag/flips; dnd-kit for snap zones; Zustand + Immer.
- **Realtime + game logic**: Cloudflare Durable Objects (one DO per room, in-memory authoritative state, hibernating WebSockets).
- **Engine**: pure TypeScript in `src/engine/` — no I/O, used by both server and client.
- **Tests**: Vitest for the engine, Playwright + gstack browse for end-to-end.

## Repo layout

```
src/
  app/                 # Next.js routes
  components/          # React UI
  engine/              # pure rules engine — no React, no I/O
    cards.ts           # 110-card master deck
    state.ts           # GameState, Player, TableauGroup
    reduce.ts          # applyAction(state, action) -> newState
    rng.ts             # mulberry32 deterministic shuffle
worker/                # Cloudflare Worker + DurableObject
assets/                # textures, illustrations, icons
monopoly_deal_ui_screenshots/  # visual inspiration
```

## Run commands

- `bun run dev` — Next.js dev server.
- `bun run worker:dev` — Cloudflare Worker locally (wrangler dev).
- `bun run test:run` — Vitest engine tests (one-shot).
- `bun run test` — Vitest watch mode.
- `bun run typecheck` — Next.js / app TS check.
- `bun run typecheck:worker` — Worker TS check.

## Conventions

- The engine is pure: `applyAction(state, action) -> newState`. Never mutate; never do I/O. All randomness goes through `rng.ts` so tests are deterministic.
- Card data lives in `src/engine/cards.ts`. `assertDeckTotals()` runs at module load and throws if counts drift from 110.
- IP-safe naming: no Hasbro / Monopoly trademarks. Internal `ActionKind` keys stay descriptive (slyDeal, dealBreaker) but display labels live in `ACTION_LABELS` and use friendly reskin names.
- Use bun, not npm — bun is the only package manager in the local env.

## Plan

Detailed plan with phases at `~/.claude/plans/i-want-to-recreate-humble-pinwheel.md`.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
