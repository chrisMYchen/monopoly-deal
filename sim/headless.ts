// Headless multi-seat sim. Drives N WebSocket clients directly against the
// bun dev-server, runs the same greedy policy as `sim/play.ts`, but with NO
// browser dependency. Designed for cloud agent envs (Claude cloud, Codex
// sandboxes, GH Codespaces) where Playwright/gstack aren't available.
//
// Run:    bun sim/headless.ts
// Env:    SEED=1234 SEATS=4 WORKER=http://localhost:8787 \
//         POLICY=greedy MAX_ACTIONS=600 RUN_ID=my-run bun sim/headless.ts
//
// Prereq: `bun run server:dev:inject` (DEV_INJECT not strictly required, but
//         the script is cheap and the same command is used by `test:e2e`).
//
// Output: runs/<RUN_ID>/manifest.json + actions.jsonl + final-state.json.
//         No screenshots — for that, use `sim/play.ts`.
//
// Why this exists separately from sim/play.ts: that one needs a real browser
// because it tests the React layer + animations. This one tests the engine
// over the wire and proves the game runs to completion under the policy.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { whoActsNow, greedyPolicy, randomValidPolicy } from "@/lib/simPolicy";
import type { Action } from "@/engine/reduce";
import type { ProjectedGameState } from "@/engine/project";
import type { PlayerId } from "@/engine/state";
import type { ClientToServer, ServerToClient } from "../worker/src/protocol";

// ---------- Config ----------

const SEED = Number(process.env.SEED ?? Date.now() % 2147483647);
const SEATS = Math.max(2, Math.min(5, Number(process.env.SEATS ?? 4)));
const WORKER = process.env.WORKER ?? "http://localhost:8787";
const MAX_ACTIONS = Number(process.env.MAX_ACTIONS ?? 600);
const STEP_TIMEOUT_MS = Number(process.env.STEP_TIMEOUT_MS ?? 2500);
const POLICY = (process.env.POLICY ?? "greedy") as "greedy" | "random";
const RUN_ID = process.env.RUN_ID ?? `headless-${SEED}-${Date.now()}`;
const RUN_DIR = join(process.cwd(), "runs", RUN_ID);
const NAMES = ["Ada", "Bea", "Cy", "Dax", "Eve"].slice(0, SEATS);

mkdirSync(RUN_DIR, { recursive: true });
const log = (msg: string): void => {
  const stamp = new Date().toISOString().slice(11, 23);
  console.log(`[${stamp}] ${msg}`);
};

// ---------- WS client ----------

// Each seat owns one WebSocket. State messages stream in continuously; we
// keep the latest projection plus a tick counter so the action loop can wait
// for "next state after my send."
class Seat {
  index: number;
  name: string;
  sessionId: string;
  socket: WebSocket;
  playerId: PlayerId | null = null;
  isHost = false;
  latest: ProjectedGameState | null = null;
  tick = 0;
  ready = false;
  closed = false;
  joined = false;
  errors: string[] = [];
  private joinResolvers: Array<() => void> = [];

  constructor(index: number, name: string) {
    this.index = index;
    this.name = name;
    // Stable per-run session id. Doubles as the engine's playerId on the
    // server (see dev-server.ts handleJoin).
    this.sessionId = `headless-${RUN_ID}-seat${index}`;
    const wsUrl = WORKER.replace(/^http/, "ws");
    this.socket = new WebSocket(`${wsUrl}/r/${ROOM_CODE}/ws`);

    this.socket.addEventListener("open", () => {
      this.ready = true;
    });
    this.socket.addEventListener("close", () => {
      this.closed = true;
    });
    this.socket.addEventListener("message", (ev) => {
      let msg: ServerToClient;
      try {
        msg = JSON.parse(ev.data as string) as ServerToClient;
      } catch {
        return;
      }
      if (msg.type === "joined") {
        this.playerId = msg.playerId;
        this.isHost = msg.isHost;
        this.joined = true;
        for (const r of this.joinResolvers) r();
        this.joinResolvers = [];
      } else if (msg.type === "state") {
        this.latest = msg.state;
        this.tick += 1;
      } else if (msg.type === "error") {
        this.errors.push(msg.message);
        log(`seat ${this.index} (${this.name}) error: ${msg.message}`);
      }
    });
  }

  async waitOpen(timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (!this.ready && Date.now() - start < timeoutMs) {
      await Bun.sleep(10);
    }
    if (!this.ready) throw new Error(`seat ${this.index} ws never opened`);
  }

  send(msg: ClientToServer): void {
    this.socket.send(JSON.stringify(msg));
  }

  async waitJoined(timeoutMs = 5000): Promise<void> {
    if (this.joined) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`seat ${this.index} join timeout`)),
        timeoutMs,
      );
      this.joinResolvers.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // Wait for a fresh `state` message after `tickBefore`. Returns the new
  // projection, or null on timeout.
  async waitNextTick(
    tickBefore: number,
    timeoutMs = STEP_TIMEOUT_MS,
  ): Promise<ProjectedGameState | null> {
    const start = Date.now();
    while (this.tick === tickBefore && Date.now() - start < timeoutMs) {
      if (this.closed) return null;
      await Bun.sleep(10);
    }
    return this.latest;
  }

  close(): void {
    try {
      this.socket.close();
    } catch {
      // ignore
    }
  }
}

// ---------- Main ----------

let ROOM_CODE = "";

async function createRoom(): Promise<string> {
  const res = await fetch(`${WORKER}/api/rooms`, { method: "POST" });
  if (!res.ok) throw new Error(`createRoom failed: ${res.status}`);
  const { code } = (await res.json()) as { code: string };
  if (!code) throw new Error(`createRoom: missing code`);
  return code;
}

async function probeWorker(): Promise<void> {
  try {
    const res = await fetch(`${WORKER}/api/rooms`, { method: "OPTIONS" });
    if (!res.ok && res.status !== 405 && res.status !== 404) {
      throw new Error(`status=${res.status}`);
    }
  } catch (e) {
    throw new Error(
      `worker not reachable at ${WORKER} — run \`bun run server:dev:inject\` first. (${e})`,
    );
  }
}

async function main(): Promise<void> {
  const t0 = Date.now();
  log(`run=${RUN_ID} seed=${SEED} seats=${SEATS} policy=${POLICY}`);
  log(`worker=${WORKER}`);
  log(`run dir: ${RUN_DIR}`);

  await probeWorker();
  ROOM_CODE = await createRoom();
  log(`room created: ${ROOM_CODE}`);

  // Spawn N WS clients in parallel. Each connects, joins, waits for the
  // server's `joined` echo so we know our playerId.
  const seats: Seat[] = [];
  for (let i = 0; i < SEATS; i++) {
    seats.push(new Seat(i, NAMES[i] ?? `Bot${i + 1}`));
  }
  await Promise.all(seats.map((s) => s.waitOpen()));

  // Join sequentially in seat-index order. Sequential matters: the first to
  // join is the host, and the lobby player order is broadcast-stable.
  for (const s of seats) {
    s.send({ type: "join", sessionId: s.sessionId, name: s.name });
    await s.waitJoined();
    log(`seat ${s.index} joined as ${s.playerId} (host=${s.isHost})`);
  }

  // Wait for host projection to show all seats in lobby.
  const host = seats[0];
  if (!host) throw new Error("no host seat");
  await waitFor(
    () => host.latest && host.latest.phase === "lobby" && host.latest.players.length === SEATS,
    5000,
    `all ${SEATS} seats in lobby`,
  );

  // Start game with pinned seed.
  host.send({ type: "start", rngSeed: SEED });
  await waitFor(
    () => host.latest && host.latest.phase === "playing",
    5000,
    `playing phase`,
  );
  log(`game started at t+${Date.now() - t0}ms`);

  // Indexed seat lookup.
  const seatByPlayer = new Map<PlayerId, Seat>();
  for (const s of seats) {
    if (!s.playerId) throw new Error(`seat ${s.index} has no playerId`);
    seatByPlayer.set(s.playerId, s);
  }

  // ---------- Decision loop ----------

  const policyFor = (seed: number) =>
    POLICY === "random" ? randomValidPolicy(seed) : greedyPolicy(seed);

  const actionsLog: Array<{ idx: number; actor: PlayerId; action: Action }> = [];
  let actionsCount = 0;
  let consecutiveStuck = 0;
  let lastActor: PlayerId | null = null;
  let lastActorRepeats = 0;

  while (actionsCount < MAX_ACTIONS) {
    const proj = host.latest;
    if (!proj) {
      consecutiveStuck += 1;
      if (consecutiveStuck > 50) {
        log(`stuck: no host projection`);
        break;
      }
      await Bun.sleep(20);
      continue;
    }
    if (proj.phase === "ended") {
      log(`game ended; winner=${proj.winnerId ?? "n/a"}`);
      break;
    }

    const actorId = whoActsNow(proj);
    if (!actorId) {
      consecutiveStuck += 1;
      if (consecutiveStuck > 50) {
        log(`stuck: no actor on clock`);
        break;
      }
      await Bun.sleep(20);
      continue;
    }
    consecutiveStuck = 0;

    const actorSeat = seatByPlayer.get(actorId);
    if (!actorSeat) throw new Error(`no seat for player ${actorId}`);
    if (!actorSeat.latest) {
      // Actor's own seat hasn't received its first projection yet.
      await Bun.sleep(20);
      continue;
    }

    if (actorId === lastActor) lastActorRepeats += 1;
    else lastActorRepeats = 0;
    lastActor = actorId;
    if (lastActorRepeats > 60) {
      log(`actor ${actorId} stuck after 60 attempts — breaking`);
      break;
    }

    actionsCount += 1;
    const seatSeed = SEED + actionsCount * 1000 + (actorSeat.index + 1);
    const policy = policyFor(seatSeed);
    const action = policy(actorSeat.latest, actorId);
    if (!action) {
      // Policy returned null on a non-pending state — usually means the
      // actor has no legal moves (shouldn't happen in valid phases). Just
      // tick the loop; the stuck counter will eventually bail out.
      await Bun.sleep(20);
      continue;
    }

    actionsLog.push({ idx: actionsCount, actor: actorId, action });
    const tickBefore = actorSeat.tick;
    actorSeat.send({
      type: "action",
      action,
      clientActionId: `${RUN_ID}-${actionsCount}`,
    });
    const next = await actorSeat.waitNextTick(tickBefore, STEP_TIMEOUT_MS);
    if (!next) {
      log(`step ${actionsCount}: no echo within ${STEP_TIMEOUT_MS}ms`);
    }

    if (actionsCount % 25 === 0) {
      const sets = proj.players.map((p) => {
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
        `progress action=${actionsCount} turn=${proj.players[proj.currentTurn]?.name} sets={${sets.join(",")}}`,
      );
    }
  }

  const finalProj = host.latest;
  const elapsedMs = Date.now() - t0;

  const manifest = {
    runId: RUN_ID,
    seed: SEED,
    policy: POLICY,
    seats: seats.map((s) => ({
      index: s.index,
      name: s.name,
      sessionId: s.sessionId,
      playerId: s.playerId,
      isHost: s.isHost,
      errorCount: s.errors.length,
    })),
    actionsCount,
    finalPhase: finalProj?.phase ?? "unknown",
    winnerId: finalProj?.winnerId ?? null,
    elapsedMs,
    worker: WORKER,
    roomCode: ROOM_CODE,
  };
  writeFileSync(join(RUN_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(
    join(RUN_DIR, "actions.jsonl"),
    actionsLog.map((a) => JSON.stringify(a)).join("\n") + (actionsLog.length ? "\n" : ""),
  );
  if (finalProj) {
    writeFileSync(
      join(RUN_DIR, "final-state.json"),
      JSON.stringify(finalProj, null, 2),
    );
  }

  log(
    `done. actions=${actionsCount} phase=${finalProj?.phase ?? "?"} winner=${finalProj?.winnerId ?? "n/a"} elapsed=${(elapsedMs / 1000).toFixed(1)}s`,
  );
  log(`artifacts: ${RUN_DIR}`);

  // Clean shutdown so the script exits promptly.
  for (const s of seats) s.close();

  // Non-zero exit if the game didn't reach a clean end-state — useful as a
  // CI regression gate.
  if (finalProj?.phase !== "ended") {
    log(`WARN: game did not reach 'ended' phase`);
    process.exit(2);
  }
}

async function waitFor(
  pred: () => unknown,
  timeoutMs: number,
  desc: string,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await Bun.sleep(20);
  }
  throw new Error(`waitFor timeout: ${desc}`);
}

main().catch((e) => {
  console.error("[headless] fatal:", e);
  process.exit(1);
});
