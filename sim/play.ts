// gstack-driven multi-seat sim. Spawns N tabs against the local dev stack
// (Next.js on :3000 + worker on :8787), joins them all to one room, kicks off
// a deterministic game with a pinned seed, and runs each seat through a
// random-valid policy until the game ends. Captures screenshots at moments.
//
// Run:    bun sim/play.ts
// Env:    SEED=1234 SEATS=4 APP=http://localhost:3000 \
//         WORKER=http://localhost:8787 RUN_ID=my-run \
//         MAX_MOMENTS=8 SCREENSHOT_SEATS=2 bun sim/play.ts
//
// Speed notes:
//  - The bridge exposes `sendAndAwait(action)` which collapses send + tick
//    poll + state read into one JS call.
//  - We stay on the actor's tab as long as they're the actor.
//  - Screenshots are capped (MAX_MOMENTS) and only N seats are captured per
//    moment (SCREENSHOT_SEATS) — most of the runtime budget went there.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { $b, $bRaw, newTab, runJs, screenshot, switchTo } from "./b";
import { whoActsNow } from "@/lib/simPolicy";
import { MomentTracker } from "./moments";
import type { Action } from "@/engine/reduce";
import type { ProjectedGameState } from "@/engine/project";
import type { PlayerId } from "@/engine/state";

// ---------- Config ----------

const SEED = Number(process.env.SEED ?? Date.now() % 2147483647);
const SEATS = Math.max(2, Math.min(5, Number(process.env.SEATS ?? 4)));
const APP = process.env.APP ?? "http://localhost:3000";
const WORKER = process.env.WORKER ?? "http://localhost:8787";
const MAX_ACTIONS = Number(process.env.MAX_ACTIONS ?? 600);
const STEP_TIMEOUT_MS = Number(process.env.STEP_TIMEOUT_MS ?? 2500);
const MAX_MOMENTS = Number(process.env.MAX_MOMENTS ?? 8);
const SCREENSHOT_SEATS = Math.max(
  1,
  Math.min(SEATS, Number(process.env.SCREENSHOT_SEATS ?? 2)),
);
const POLICY = (process.env.POLICY ?? "greedy") as "greedy" | "random";
const RUN_ID = process.env.RUN_ID ?? `${SEED}-${Date.now()}`;
const RUN_DIR = join(process.cwd(), "runs", RUN_ID);
const NAMES = ["Ada", "Bea", "Cy", "Dax", "Eve"].slice(0, SEATS);

// Viewport matrix — surface mobile/desktop layout bugs in one run. Default
// gives one mobile portrait + one mobile landscape-ish + two desktops; you
// can override via `VIEWPORTS=390x844,1440x900,...`.
const DEFAULT_VIEWPORTS = ["390x844", "1440x900", "414x896", "1280x800"];
const VIEWPORTS = (process.env.VIEWPORTS ?? DEFAULT_VIEWPORTS.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ---------- Run dir ----------

mkdirSync(join(RUN_DIR, "moments"), { recursive: true });
const log = (msg: string): void => {
  const stamp = new Date().toISOString().slice(11, 23);
  console.log(`[${stamp}] ${msg}`);
};

// ---------- Helpers ----------

async function createRoom(): Promise<string> {
  const res = await fetch(`${WORKER}/api/rooms`, { method: "POST" });
  if (!res.ok) throw new Error(`createRoom failed: ${res.status}`);
  const body = (await res.json()) as { code?: string };
  if (!body.code) throw new Error(`createRoom: no code in ${JSON.stringify(body)}`);
  return body.code;
}

type Seat = {
  index: number;
  tabId: number;
  name: string;
  playerId: PlayerId | null;
  viewport: string;
};

async function setViewport(tabId: number, viewport: string): Promise<void> {
  // gstack `viewport WxH` resizes the active tab. Switch first.
  await switchTo(tabId);
  await $b("viewport", viewport);
}

async function bridgeReady(tabId: number): Promise<boolean> {
  return runJs<boolean>(tabId, `typeof window.__rr === 'object' && !!window.__rr`);
}

async function getProjection(
  tabId: number,
): Promise<ProjectedGameState | null> {
  return runJs<ProjectedGameState | null>(tabId, `window.__rr.getState()`);
}

async function startGame(tabId: number, seed: number): Promise<void> {
  await runJs(tabId, `window.__rr.start(${seed})`);
}

// Send and await echo in a single JS call. Returns the new projection (or
// null if the timeout fired without a state change).
async function sendAndAwait(
  tabId: number,
  action: Action,
  timeoutMs = STEP_TIMEOUT_MS,
): Promise<ProjectedGameState | null> {
  return runJs<ProjectedGameState | null>(
    tabId,
    `await window.__rr.sendAndAwait(${JSON.stringify(action)}, ${timeoutMs})`,
  );
}

// Run one full policy step in-browser. The bridge reads state, picks a legal
// action, sends, awaits echo, and returns the new projection plus the action
// it picked (so we can log it on the bun side).
async function policyStep(
  tabId: number,
  rngSeed: number,
  timeoutMs = STEP_TIMEOUT_MS,
  kind: "random" | "greedy" = POLICY,
): Promise<{ action: Action | null; state: ProjectedGameState | null }> {
  return runJs(
    tabId,
    `await window.__rr.policyStep(${rngSeed}, ${timeoutMs}, ${JSON.stringify(kind)})`,
  );
}

async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  ms: number,
  desc: string,
): Promise<T> {
  const start = Date.now();
  let last: unknown = null;
  while (Date.now() - start < ms) {
    try {
      const v = await fn();
      if (v !== null && v !== undefined && (v as unknown) !== false) {
        return v as T;
      }
      last = v;
    } catch (e) {
      last = e;
    }
    await Bun.sleep(80);
  }
  throw new Error(`waitFor timeout (${desc}); last=${String(last)}`);
}

async function awaitProjection(tabId: number): Promise<ProjectedGameState> {
  return waitFor(async () => await getProjection(tabId), STEP_TIMEOUT_MS, "projection");
}

// ---------- Main ----------

async function main(): Promise<void> {
  const t0 = Date.now();
  log(`run=${RUN_ID} seed=${SEED} seats=${SEATS}`);
  log(`run dir: ${RUN_DIR}`);

  // Sanity: servers reachable.
  try {
    const probe = await fetch(`${APP}`, { method: "HEAD" });
    if (!probe.ok && probe.status !== 405) throw new Error(`status=${probe.status}`);
  } catch (e) {
    throw new Error(`Next dev not at ${APP} — run \`bun run dev\` first. (${e})`);
  }

  // 1) Create a room.
  const roomCode = await createRoom();
  log(`room created: ${roomCode}`);

  // 2) Spawn N tabs, each as a distinct named bot. The first tab is opened
  // serially (it primes the gstack daemon), the rest in parallel.
  const viewportFor = (i: number): string =>
    VIEWPORTS[i % VIEWPORTS.length] ?? "1280x800";
  const seats: Seat[] = [];
  const firstName = NAMES[0] ?? "Ada";
  const firstUrl = `${APP}/r/?code=${roomCode}&asName=${encodeURIComponent(firstName)}`;
  const firstTab = await openFirst(firstUrl);
  seats.push({
    index: 0,
    tabId: firstTab,
    name: firstName,
    playerId: null,
    viewport: viewportFor(0),
  });

  const restPromises = [];
  for (let i = 1; i < SEATS; i++) {
    const name = NAMES[i] ?? `Bot${i + 1}`;
    const url = `${APP}/r/?code=${roomCode}&asName=${encodeURIComponent(name)}`;
    const idx = i;
    restPromises.push(
      newTab(url).then((tabId) => ({
        index: idx,
        tabId,
        name,
        playerId: null as PlayerId | null,
        viewport: viewportFor(idx),
      })),
    );
  }
  const rest = await Promise.all(restPromises);
  for (const s of rest) seats.push(s);
  for (const s of seats) log(`seat ${s.index} (${s.name}) -> tab ${s.tabId} @ ${s.viewport}`);

  // 3) Set viewport per seat. Serial — gstack's single active-tab model.
  for (const s of seats) {
    try {
      await setViewport(s.tabId, s.viewport);
    } catch (e) {
      log(`viewport set failed seat=${s.index}: ${String(e)}`);
    }
  }

  // 4) Wait for the bridge + a projection on each seat.
  for (const s of seats) {
    await waitFor(async () => await bridgeReady(s.tabId), 30_000, `bridge tab ${s.tabId}`);
    const proj = await awaitProjection(s.tabId);
    s.playerId = proj.selfId;
  }
  log(`all ${SEATS} seats joined (policy=${POLICY})`);

  // 4) Wait for the host's projection to show all seats in lobby.
  await waitFor(
    async () => {
      const p = await getProjection(seats[0]!.tabId);
      return p && p.phase === "lobby" && p.players.length === SEATS ? true : null;
    },
    20_000,
    `all ${SEATS} seats in lobby`,
  );

  // 5) Start game with pinned seed (host).
  await startGame(seats[0]!.tabId, SEED);
  // Read host's first playing-phase projection.
  let projection = await waitFor(
    async () => {
      const p = await getProjection(seats[0]!.tabId);
      return p && p.phase === "playing" ? p : null;
    },
    8000,
    "playing phase",
  );
  log(`game started (seed=${SEED}) — t+${(Date.now() - t0)}ms`);

  // 7) Decision loop. Policy runs in-browser via the bridge; we only need
  // to track who's on the clock and forward a per-seat RNG seed.
  const seatByPlayer = new Map<PlayerId, Seat>();
  const seatSeeds = new Map<PlayerId, number>();
  for (let i = 0; i < seats.length; i++) {
    const s = seats[i]!;
    if (!s.playerId) throw new Error(`seat ${s.index} has no playerId`);
    seatByPlayer.set(s.playerId, s);
    seatSeeds.set(s.playerId, SEED + i * 1000 + 1);
  }

  const tracker = new MomentTracker();
  const actionsLog: Array<{ idx: number; actor: PlayerId; action: Action }> = [];

  let actionsCount = 0;
  let consecutiveStuck = 0;
  let lastActor: PlayerId | null = null;
  let lastActorRepeats = 0;
  let momentsCaptured = 0;
  // Already-screenshotted log indices (skip duplicate sub-event captures —
  // e.g. slyDeal "plays" + slyDeal "stole" both fire in the same physical
  // tick; one screenshot is enough).
  const lastMomentTick: { actorId: PlayerId | null; idx: number } = {
    actorId: null,
    idx: -1,
  };

  while (actionsCount < MAX_ACTIONS) {
    if (projection.phase === "ended") {
      log(`game ended; winner=${projection.winnerId ?? "n/a"}`);
      break;
    }

    const actorId = whoActsNow(projection);
    if (!actorId) {
      consecutiveStuck += 1;
      if (consecutiveStuck > 20) {
        log(`stuck: no actor on clock`);
        break;
      }
      // Re-read from host (cheap if same tab) and retry.
      const p = await getProjection(seats[0]!.tabId);
      if (p) projection = p;
      await Bun.sleep(40);
      continue;
    }
    consecutiveStuck = 0;

    const seat = seatByPlayer.get(actorId);
    if (!seat) throw new Error(`no seat for player ${actorId}`);

    if (actorId === lastActor) lastActorRepeats += 1;
    else lastActorRepeats = 0;
    lastActor = actorId;
    if (lastActorRepeats > 40) {
      log(`actor ${actorId} stuck after 40 attempts — breaking`);
      break;
    }

    actionsCount += 1;

    // One JS call: bridge reads state, runs policy, sends action, awaits echo.
    const seatSeed = (seatSeeds.get(actorId) ?? SEED) + actionsCount;
    seatSeeds.set(actorId, seatSeed);
    let stepResult: { action: Action | null; state: ProjectedGameState | null };
    try {
      stepResult = await policyStep(seat.tabId, seatSeed, STEP_TIMEOUT_MS);
    } catch (e) {
      log(`policyStep error #${actionsCount}: ${String(e)}`);
      continue;
    }
    let next = stepResult.state;
    if (!next) {
      next = (await getProjection(seat.tabId)) ?? projection;
    }
    if (stepResult.action) {
      actionsLog.push({ idx: actionsCount, actor: actorId, action: stepResult.action });
    }
    projection = next;

    // Moments — log always, screenshot only up to MAX_MOMENTS.
    const moments = tracker.observe(projection);
    if (moments.length > 0) {
      // Pick the most narratively interesting moment from this batch.
      const m = moments[moments.length - 1]!;
      const tickKey = { actorId, idx: actionsCount };
      const dup =
        lastMomentTick.actorId === tickKey.actorId &&
        lastMomentTick.idx === tickKey.idx;
      if (!dup) {
        lastMomentTick.actorId = actorId;
        lastMomentTick.idx = actionsCount;
        log(`MOMENT #${actionsCount} [${m.kind}] ${m.message}`);
        if (momentsCaptured < MAX_MOMENTS) {
          const slug = `${String(actionsCount).padStart(4, "0")}_${m.kind}`;
          const order = [seat, ...seats.filter((s) => s !== seat)].slice(
            0,
            SCREENSHOT_SEATS,
          );
          for (const s of order) {
            const path = join(
              RUN_DIR,
              "moments",
              `${slug}_seat${s.index}_${s.name}.png`,
            );
            try {
              await screenshot(s.tabId, path);
            } catch (e) {
              log(`screenshot failed seat=${s.index}: ${String(e)}`);
            }
          }
          momentsCaptured += 1;
        }
      }
    }

    // Heartbeat every 20 actions so a stuck loop is obvious.
    if (actionsCount % 20 === 0) {
      const completedSets = projection.players.map((p) => {
        // Engine's complete-set predicate (we inline it to avoid an import
        // — projection has cardIds + color; SET_COMPLETE thresholds:
        //  brown/darkBlue/utility = 2, RR = 4, others = 3).
        const thresholds: Record<string, number> = {
          brown: 2,
          darkBlue: 2,
          utility: 2,
          railroad: 4,
        };
        let n = 0;
        for (const g of p.propertySets) {
          const need = thresholds[g.color] ?? 3;
          if (g.cardIds.length >= need) n += 1;
        }
        return `${p.name}=${n}`;
      });
      log(
        `progress action=${actionsCount} turn=${projection.players[projection.currentTurn]?.name} sets={${completedSets.join(",")}}`,
      );
    }
  }

  // 7) Final screenshot per seat (always — this is the post-game shot).
  for (const s of seats) {
    const path = join(RUN_DIR, "moments", `final_seat${s.index}_${s.name}.png`);
    try {
      await screenshot(s.tabId, path);
    } catch {
      // ignore
    }
  }

  const elapsedMs = Date.now() - t0;

  // 8) Manifest + actions log.
  const manifest = {
    runId: RUN_ID,
    seed: SEED,
    policy: POLICY,
    seats: seats.map((s) => ({
      index: s.index,
      name: s.name,
      tabId: s.tabId,
      playerId: s.playerId,
      viewport: s.viewport,
    })),
    actionsCount,
    momentsCaptured,
    finalPhase: projection.phase,
    winnerId: projection.winnerId ?? null,
    elapsedMs,
    app: APP,
    worker: WORKER,
  };
  writeFileSync(join(RUN_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(
    join(RUN_DIR, "actions.jsonl"),
    actionsLog.map((a) => JSON.stringify(a)).join("\n") + "\n",
  );

  log(
    `done. actions=${actionsCount} moments=${momentsCaptured} phase=${projection.phase} winner=${projection.winnerId ?? "n/a"} elapsed=${(elapsedMs / 1000).toFixed(1)}s`,
  );
  log(`artifacts: ${RUN_DIR}`);
}

async function openFirst(url: string): Promise<number> {
  const probe = await $bRaw("tabs");
  if (probe.code !== 0) {
    // gstack daemon has no active tab (or just spun up). It refuses both
    // `newtab` and `tabs` until a `goto` primes one. Prime, then re-list to
    // grab the tab id.
    await $b("goto", url);
    const after = await $bRaw("tabs");
    const m2 = after.stdout.match(/(?:^|\n)\s*[→\s]*\[?(\d+)[\]:\s]/);
    if (m2) return Number(m2[1]);
    // Fallback: assume tab 1 (default of a freshly-spun daemon).
    return 1;
  }
  const m = probe.stdout.match(/(?:^|\n)\s*[→\s]*\[?(\d+)[\]:\s]/);
  if (m) {
    const id = Number(m[1]);
    await switchTo(id);
    await $b("goto", url);
    return id;
  }
  return await newTab(url);
}

main().catch(async (e) => {
  console.error("[sim] fatal:", e);
  try {
    const t = await $bRaw("tabs");
    console.error("[sim] tabs:", t.stdout);
  } catch {
    // ignore
  }
  process.exit(1);
});
