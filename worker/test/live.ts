// Live-origin smoke test: drives a real game over the deployed worker via
// WebSockets, including a long idle pause that triggers Cloudflare DO
// hibernation. This is the regression scenario that produced
// "session has no player" before the constructor-side session restore.
//
// Run:
//   ORIGIN=https://realty-royale-worker.<subdomain>.workers.dev bun worker/test/live.ts
//
// Without ORIGIN set, defaults to localhost:8787 so it works against
// `bun run worker:dev` too.
//
// What it does:
//   1. POST /api/rooms — get a fresh room code.
//   2. Connect Alice + Bob, lobby join.
//   3. Alice (host) starts the game.
//   4. Wait 35 seconds — long enough for Cloudflare to hibernate the DO.
//      (Hibernation kicks in well under that on the real platform.)
//   5. Alice sends DRAW_TURN_START (or whichever action her turn allows).
//      Pre-fix: server replies with "error: session has no player".
//      Post-fix: server applies the action, broadcasts state, game continues.
//   6. Loop a few more turns to confirm the game is actually playable.
//
// Exits 0 on success, non-zero on any assertion failure.

import type { ClientToServer, ServerToClient } from "../src/protocol";
import type { ProjectedGameState } from "../../src/engine/project";
import type { Action } from "../../src/engine/reduce";

const ORIGIN = process.env.ORIGIN ?? "http://localhost:8787";
const HIBERNATE_PAUSE_MS = Number(process.env.HIBERNATE_PAUSE_MS ?? 35_000);
const TURN_LIMIT = Number(process.env.TURN_LIMIT ?? 6);

const ALICE = `alice-live-${Date.now().toString(36)}`;
const BOB = `bob-live-${Date.now().toString(36)}`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

class C {
  ws: WebSocket;
  open = false;
  inbox: ServerToClient[] = [];
  errors: string[] = [];
  playerId: string | null = null;
  constructor(roomCode: string) {
    const wsUrl = ORIGIN.replace(/^http/, "ws") + `/r/${roomCode}/ws`;
    this.ws = new WebSocket(wsUrl);
    this.ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data as string) as ServerToClient;
      this.inbox.push(m);
      if (m.type === "error") this.errors.push(m.message);
      if (m.type === "joined") this.playerId = m.playerId;
    });
    this.ws.addEventListener("open", () => {
      this.open = true;
    });
  }
  async ready(): Promise<void> {
    if (this.open) return;
    await new Promise<void>((resolve, reject) => {
      const onOpen = (): void => resolve();
      const onErr = (): void => reject(new Error("socket failed to open"));
      this.ws.addEventListener("open", onOpen, { once: true });
      this.ws.addEventListener("error", onErr, { once: true });
      setTimeout(() => reject(new Error("socket open timeout")), 10_000);
    });
  }
  send(msg: ClientToServer): void {
    this.ws.send(JSON.stringify(msg));
  }
  async waitFor<T extends ServerToClient["type"]>(
    type: T,
    timeoutMs = 5000,
  ): Promise<Extract<ServerToClient, { type: T }>> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const idx = this.inbox.findIndex((m) => m.type === type);
      if (idx >= 0) return this.inbox.splice(idx, 1)[0] as Extract<ServerToClient, { type: T }>;
      await sleep(20);
    }
    throw new Error(`timeout waiting for ${type} (errors so far: ${this.errors.join(", ")})`);
  }
  async waitForState(
    pred: (s: ProjectedGameState) => boolean,
    timeoutMs = 5000,
  ): Promise<ProjectedGameState> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // Scan from newest backward to avoid acting on stale state.
      for (let i = this.inbox.length - 1; i >= 0; i--) {
        const m = this.inbox[i]!;
        if (m.type !== "state") continue;
        if (!pred(m.state)) continue;
        this.inbox = this.inbox.filter(
          (msg, j) => msg.type !== "state" || j > i,
        );
        return m.state;
      }
      await sleep(20);
    }
    throw new Error(
      `timeout waiting for matching state (errors so far: ${this.errors.join(", ")})`,
    );
  }
  drainState(): ProjectedGameState | null {
    let last: ProjectedGameState | null = null;
    for (let i = this.inbox.length - 1; i >= 0; i--) {
      if (this.inbox[i]!.type === "state") {
        last = (this.inbox[i] as { state: ProjectedGameState }).state;
        break;
      }
    }
    this.inbox = this.inbox.filter((m) => m.type !== "state");
    return last;
  }
  close(): void {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

async function createRoom(): Promise<string> {
  const res = await fetch(ORIGIN + "/api/rooms", { method: "POST" });
  if (!res.ok) throw new Error(`create room failed: HTTP ${res.status}`);
  const body = (await res.json()) as { code: string };
  return body.code;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

// Pick the simplest legal play given the current state: if we haven't drawn,
// draw; else end turn. We don't try to play property/action cards because
// engine rules vary by hand and that would balloon this script.
function nextActionFor(state: ProjectedGameState, selfId: string): Action | null {
  if (state.phase !== "playing") return null;
  const onClock = state.players[state.currentTurn]?.id;
  if (onClock !== selfId) return null;
  if (state.pending) return null;
  if (!state.hasDrawnThisTurn) return { type: "DRAW_TURN_START", playerId: selfId };
  // Discard down if needed (engine enforces hand <= 7 only at end of turn).
  const me = state.players.find((p) => p.id === selfId);
  if (me && me.hand.length > 7) {
    return { type: "DISCARD_TO_HAND_LIMIT", playerId: selfId, cardIds: me.hand.slice(7) };
  }
  return { type: "END_TURN", playerId: selfId };
}

async function runFullGame(): Promise<void> {
  console.log(`→ origin: ${ORIGIN}`);
  const code = await createRoom();
  console.log(`✓ room ${code}`);

  const alice = new C(code);
  await alice.ready();
  alice.send({ type: "join", sessionId: ALICE, name: "Alice" });
  // Sequence the joins: whoever arrives first becomes host. Wait for Alice's
  // joined reply before letting Bob join so the host is deterministic.
  const aliceJoined = await alice.waitFor("joined");
  assert(aliceJoined.isHost, "alice should be host (joined first)");
  const bob = new C(code);
  await bob.ready();
  bob.send({ type: "join", sessionId: BOB, name: "Bob" });
  await bob.waitFor("joined");
  await alice.waitForState((s) => s.phase === "lobby" && s.players.length === 2);
  console.log("✓ both joined lobby");

  alice.send({ type: "start", rngSeed: 42 });
  let aliceState = await alice.waitForState((s) => s.phase === "playing");
  await bob.waitForState((s) => s.phase === "playing");
  console.log(`✓ game started — first turn: ${aliceState.players[aliceState.currentTurn]?.name}`);

  // The hibernation regression test: idle long enough for Cloudflare to evict
  // the DO process, then send an action without reconnecting. Sockets stay
  // open across hibernation; the bug was that the in-memory sessions Map
  // was empty post-wake.
  console.log(`→ idle pause: ${HIBERNATE_PAUSE_MS}ms (waiting for hibernation)`);
  await sleep(HIBERNATE_PAUSE_MS);

  // No state messages flow during the idle pause — we keep the last known
  // state from before the pause. The next action will be the first message
  // post-hibernation; pre-fix that would surface "session has no player".
  console.log(`→ post-hibernation: acting on turn=${aliceState.currentTurn} (${aliceState.players[aliceState.currentTurn]?.name})`);

  // Play out a few turns. The first action after the idle pause is the one
  // that used to throw "session has no player".
  let turnsPlayed = 0;
  let safety = 60;
  while (turnsPlayed < TURN_LIMIT && safety-- > 0) {
    const onClockId = aliceState.players[aliceState.currentTurn]?.id;
    const actor = onClockId === ALICE ? alice : onClockId === BOB ? bob : null;
    if (!actor) throw new Error("no actor for current turn");
    const selfId = actor.playerId!;
    const action = nextActionFor(aliceState, selfId);
    if (!action) {
      // pending or some state we don't model — let engine resolve via timer
      // or just bail.
      console.log(`! skipping (pending=${!!aliceState.pending})`);
      break;
    }
    actor.send({ type: "action", action, clientActionId: `live-${Date.now()}-${turnsPlayed}` });
    if (action.type === "END_TURN") {
      aliceState = await alice.waitForState((s) => s.currentTurn !== aliceState!.currentTurn, 5000);
      turnsPlayed += 1;
      console.log(`  turn ${turnsPlayed}: ended → ${aliceState.players[aliceState.currentTurn]?.name}`);
    } else {
      aliceState = await alice.waitForState((s) => s !== aliceState, 5000);
    }
    if (actor.errors.length > 0) {
      throw new Error(`server error after action: ${actor.errors.join(", ")}`);
    }
  }
  assert(turnsPlayed >= 1, "at least one turn must have advanced after hibernation");
  console.log(`✓ played ${turnsPlayed} turns post-hibernation, no errors`);

  // Finally, confirm there were no error messages at all on either side.
  assert(alice.errors.length === 0, `alice saw errors: ${alice.errors.join(", ")}`);
  assert(bob.errors.length === 0, `bob saw errors: ${bob.errors.join(", ")}`);
  console.log("✓ no server errors observed");

  alice.close();
  bob.close();
  console.log("✓ live scenario passed");
}

runFullGame().catch((err) => {
  console.error("✗ FAILED:", err.message);
  process.exit(1);
});
