// Reconnect / dedup / heartbeat smoke test.
//
// Run while a dev-server is running (DEV_INJECT not required):
//   bun run server:dev
// Then in another terminal:
//   bun worker/test/reconnect.ts
//
// Exits non-zero on any assertion failure.

import type { ClientToServer, ServerToClient } from "../src/protocol";

const ORIGIN = process.env.ORIGIN ?? "http://localhost:8787";

const ALICE = "alice-reconnect-session-aaaaaaaaaaaaa";
const BOB = "bob-reconnect-session-bbbbbbbbbbbbbbb";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

class C {
  ws: WebSocket;
  open = false;
  inbox: ServerToClient[] = [];
  constructor(roomCode: string) {
    const wsUrl = ORIGIN.replace(/^http/, "ws") + `/r/${roomCode}/ws`;
    this.ws = new WebSocket(wsUrl);
    this.ws.addEventListener("message", (ev) => {
      this.inbox.push(JSON.parse(ev.data as string));
    });
    this.ws.addEventListener("open", () => {
      this.open = true;
    });
  }
  async ready(): Promise<void> {
    if (this.open) return;
    await new Promise<void>((resolve) =>
      this.ws.addEventListener("open", () => resolve(), { once: true }),
    );
  }
  send(msg: ClientToServer): void {
    this.ws.send(JSON.stringify(msg));
  }
  async waitFor<T extends ServerToClient["type"]>(
    type: T,
    timeoutMs = 2000,
  ): Promise<Extract<ServerToClient, { type: T }>> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const idx = this.inbox.findIndex((m) => m.type === type);
      if (idx >= 0) {
        const [m] = this.inbox.splice(idx, 1);
        return m as Extract<ServerToClient, { type: T }>;
      }
      await sleep(20);
    }
    throw new Error(`timeout waiting for ${type}`);
  }
  close(): void {
    try {
      this.ws.close();
    } catch {}
  }

  // Drain all queued state messages, returning the latest (or null if none
  // have arrived yet).
  drainStates(): Extract<ServerToClient, { type: "state" }> | null {
    let last: Extract<ServerToClient, { type: "state" }> | null = null;
    for (let i = this.inbox.length - 1; i >= 0; i--) {
      if (this.inbox[i]!.type === "state") {
        last = this.inbox[i] as Extract<ServerToClient, { type: "state" }>;
        break;
      }
    }
    this.inbox = this.inbox.filter((m) => m.type !== "state");
    return last;
  }

  // Wait until at least one state message has been received that satisfies
  // `pred`. Drains older states along the way.
  async waitForState(
    pred: (s: Extract<ServerToClient, { type: "state" }>["state"]) => boolean,
    timeoutMs = 2000,
  ): Promise<Extract<ServerToClient, { type: "state" }>> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const idx = this.inbox.findIndex(
        (m) => m.type === "state" && pred((m as any).state),
      );
      if (idx >= 0) {
        const m = this.inbox[idx] as Extract<ServerToClient, { type: "state" }>;
        // Drop everything up to and including this match (older states are stale).
        this.inbox = this.inbox.filter((_, i) => i > idx || this.inbox[i]!.type !== "state");
        return m;
      }
      await sleep(20);
    }
    throw new Error("timeout waiting for matching state");
  }
}

async function createRoom(): Promise<string> {
  const res = await fetch(ORIGIN + "/api/rooms", { method: "POST" });
  const body = (await res.json()) as { code: string };
  return body.code;
}

function assert(cond: any, msg: string): void {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

async function main(): Promise<void> {
  console.log("→ creating room…");
  const code = await createRoom();
  console.log("  room code:", code);

  // 1) Alice + Bob connect, join lobby
  const alice = new C(code);
  const bob = new C(code);
  await Promise.all([alice.ready(), bob.ready()]);
  alice.send({ type: "join", sessionId: ALICE, name: "Alice" });
  bob.send({ type: "join", sessionId: BOB, name: "Bob" });
  await alice.waitFor("joined");
  await bob.waitFor("joined");
  // Wait until both clients see both players in the lobby.
  await alice.waitForState((s) => s.phase === "lobby" && s.players.length === 2);
  await bob.waitForState((s) => s.phase === "lobby" && s.players.length === 2);
  console.log("✓ both joined lobby");

  // 2) Heartbeat: alice pings, expects pong
  alice.send({ type: "ping", t: 12345 });
  const pong = await alice.waitFor("pong", 1000);
  assert(pong.t === 12345, "pong echoes t");
  console.log("✓ ping/pong echo works");

  // 3) Host (alice) starts the game
  alice.send({ type: "start", rngSeed: 42 });
  const startedAlice = await alice.waitForState((s) => s.phase === "playing");
  await bob.waitForState((s) => s.phase === "playing");
  assert(startedAlice.state.phase === "playing", "phase is playing after start");
  console.log("✓ game started");

  // 4) Drop alice's socket abruptly. Bob should see her marked disconnected.
  alice.close();
  await sleep(150);
  const aliceFromBobState = await bob.waitForState(
    (s) => s.players.find((p) => p.id === ALICE)?.connected === false,
    1500,
  );
  assert(aliceFromBobState, "Bob saw alice marked disconnected");
  console.log("✓ disconnect propagates");

  // 5) Alice reconnects with the same sessionId. State should be restored,
  //    and her connected flag flips back to true for everyone.
  const alice2 = new C(code);
  await alice2.ready();
  alice2.send({ type: "join", sessionId: ALICE, name: "Alice" });
  const joined2 = await alice2.waitFor("joined");
  assert(joined2.playerId === ALICE, "rejoined as same player");
  const state2 = await alice2.waitForState(
    (s) => s.phase === "playing" && s.players.find((p) => p.id === ALICE)?.connected === true,
  );
  assert(state2.state.phase === "playing", "alice gets the in-progress game back");
  // Drain bob's catch-up state too.
  await bob.waitForState((s) => s.players.find((p) => p.id === ALICE)?.connected === true);
  console.log("✓ reconnect restored state and marked connected");

  // 6) Idempotent action replay. We don't want to depend on engine specifics
  //    here, so we use an action we know will be rejected by a rule (e.g. an
  //    out-of-turn play) to confirm dedup logic — but more usefully, we just
  //    send the SAME clientActionId twice with a benign action and verify the
  //    state isn't double-applied. The cleanest benign action is "leave"...
  //    but leave has no clientActionId. Simpler: we send an obviously-illegal
  //    action twice with the same id; first time it errors, but the dedup
  //    check happens BEFORE rule eval, so the second time we should NOT get a
  //    second error — instead we get a state echo.
  //
  //    Wait: handleAction's dedup runs before applyAction, so a duplicate id
  //    gets a state echo and skips applyAction entirely. So if the FIRST send
  //    fails (RuleError), recentActionIds is never updated — meaning the
  //    second send re-runs the rule and errors again. That's the correct
  //    semantics: only successful actions are "remembered" for dedup.
  //
  //    To actually exercise the success path: send a valid action, then
  //    re-send with the same id, and verify it doesn't break anything (we'll
  //    see one extra "state" message but state should be unchanged).
  //
  //    We don't know which player is on turn without parsing state, so:
  const turnIdx = state2.state.currentTurn;
  const turnPid = state2.state.players[turnIdx]!.id;
  const turnSocket = turnPid === ALICE ? alice2 : bob;
  // END_TURN requires the player to have drawn first.
  turnSocket.send({
    type: "action",
    action: { type: "DRAW_TURN_START", playerId: turnPid },
    clientActionId: "draw-" + Date.now(),
  });
  await turnSocket.waitForState((s) => s.hasDrawnThisTurn === true, 1500);
  const actId = "test-act-" + Date.now();
  turnSocket.send({
    type: "action",
    action: { type: "END_TURN", playerId: turnPid },
    clientActionId: actId,
  });
  // Wait for the turn to actually advance.
  const after1 = await turnSocket.waitForState(
    (s) => s.currentTurn !== turnIdx,
    1500,
  );
  const newTurnIdx = after1.state.currentTurn;

  // Replay same id — should be deduped: state echo arrives with current turn
  // player UNCHANGED from after1.
  turnSocket.send({
    type: "action",
    action: { type: "END_TURN", playerId: turnPid },
    clientActionId: actId,
  });
  // Wait briefly for the echo, then assert turn didn't move.
  await sleep(200);
  const latest = turnSocket.drainStates();
  assert(latest, "got a state echo on duplicate action");
  assert(
    latest!.state.currentTurn === newTurnIdx,
    `duplicate clientActionId did NOT re-advance the turn (was ${newTurnIdx}, now ${latest!.state.currentTurn})`,
  );
  console.log("✓ duplicate clientActionId is deduped");

  // Cleanup
  alice2.close();
  bob.close();
  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error("\nFAIL:", err.message);
  process.exit(1);
});
