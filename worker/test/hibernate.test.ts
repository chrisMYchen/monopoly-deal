// Regression test for the "session has no player" bug: when Cloudflare
// hibernates the Durable Object between messages, the in-memory `sessions`
// Map is wiped. Hibernated sockets still carry their sessionId via
// serializeAttachment, but handleAction/handleStart used to look the session
// up by id and throw "session has no player" because nothing rebuilt the Map.
//
// We mock just enough of the DurableObjectState + WebSocket APIs to exercise
// the Room constructor and message handlers directly. We don't try to
// faithfully simulate the whole hibernation lifecycle — we simulate the
// observable consequence: post-wake, the Room class is reconstructed from
// storage, and `state.getWebSockets()` still returns the persisted sockets
// with their attachments intact.

import { describe, expect, it } from "vitest";

import { applyAction, initialLobby } from "../../src/engine/reduce";
import type { GameState } from "../../src/engine/state";
import type { ServerToClient } from "../src/protocol";
import { Room, type Env } from "../src/index";

type Attachment = { sessionId: string };

class FakeWebSocket {
  attachment: unknown = null;
  sent: string[] = [];
  closed = false;
  serializeAttachment(value: unknown): void {
    this.attachment = value;
  }
  deserializeAttachment(): unknown {
    return this.attachment;
  }
  send(data: string): void {
    if (this.closed) throw new Error("send after close");
    this.sent.push(data);
  }
  close(_code?: number, _reason?: string): void {
    this.closed = true;
  }
  // Helpers for tests.
  receivedMessages(): ServerToClient[] {
    return this.sent.map((s) => JSON.parse(s) as ServerToClient);
  }
  lastError(): string | null {
    const errs = this.receivedMessages().filter((m) => m.type === "error");
    return errs.length ? (errs[errs.length - 1] as { message: string }).message : null;
  }
}

class FakeStorage {
  data = new Map<string, unknown>();
  alarmTime: number | null = null;

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }
  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }
  async deleteAll(): Promise<void> {
    this.data.clear();
    this.alarmTime = null;
  }
  async getAlarm(): Promise<number | null> {
    return this.alarmTime;
  }
  async setAlarm(time: number): Promise<void> {
    this.alarmTime = time;
  }
  async deleteAlarm(): Promise<void> {
    this.alarmTime = null;
  }
}

class FakeState {
  storage = new FakeStorage();
  sockets: FakeWebSocket[] = [];

  async blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
  acceptWebSocket(ws: FakeWebSocket): void {
    this.sockets.push(ws);
  }
  getWebSockets(): FakeWebSocket[] {
    return [...this.sockets];
  }
}

function makeEnv(): Env {
  return { ROOM: undefined as unknown as DurableObjectNamespace };
}

// Drives a Room through join → start → wait for it to settle, then mutates
// the FakeState as if a hibernation eviction occurred (drops the Room
// instance entirely; storage + sockets persist), constructs a new Room, and
// returns the post-wake instance plus its rehydrated game.
async function arrangeMidGame(): Promise<{
  state: FakeState;
  ws1: FakeWebSocket;
  ws2: FakeWebSocket;
  game: GameState;
}> {
  const state = new FakeState();
  const env = makeEnv();
  const room = new (Room as any)(state, env);
  // Wait for blockConcurrencyWhile to flush.
  await new Promise((r) => setTimeout(r, 0));

  const ws1 = new FakeWebSocket();
  const ws2 = new FakeWebSocket();
  // Mimic handleSocket(): accept then dispatch the join message.
  state.acceptWebSocket(ws1);
  state.acceptWebSocket(ws2);

  await room.webSocketMessage(ws1, JSON.stringify({ type: "join", sessionId: "alice", name: "Alice" }));
  await room.webSocketMessage(ws2, JSON.stringify({ type: "join", sessionId: "bob", name: "Bob" }));
  await room.webSocketMessage(ws1, JSON.stringify({ type: "start", rngSeed: 42 }));

  // Persist the in-progress game so the next constructor can rehydrate it.
  // The real persistGame is fire-and-forget; give it a tick.
  await new Promise((r) => setTimeout(r, 0));

  const game = (await state.storage.get<GameState>("game"))!;
  return { state, ws1, ws2, game };
}

describe("hibernation wake", () => {
  it("constructor restores sessions Map from hibernated sockets", async () => {
    const { state, ws1, game } = await arrangeMidGame();
    expect(game.phase).toBe("playing");
    expect(game.players.length).toBe(2);

    // Simulate hibernation eviction: discard the Room instance. Storage + the
    // FakeState's sockets persist, mirroring what Cloudflare does.
    const woken = new (Room as any)(state, makeEnv());
    await new Promise((r) => setTimeout(r, 0));

    // Inspect: post-wake, the sessions Map should be repopulated from sockets.
    const sessions = (woken as any).sessions as Map<string, { playerId: string }>;
    expect(sessions.has("alice")).toBe(true);
    expect(sessions.has("bob")).toBe(true);
    expect(sessions.get("alice")!.playerId).toBe("alice");

    // And — the actual regression — an action message right after wake must
    // succeed, not throw "session has no player".
    const onClock = game.players[game.currentTurn]!.id;
    const actor = onClock === "alice" ? ws1 : (await arrangeMidGame()).ws2;
    // (We re-derive ws if needed — alice is the host so usually goes first.)
    await woken.webSocketMessage(
      onClock === "alice" ? ws1 : (state.sockets[1] as FakeWebSocket),
      JSON.stringify({
        type: "action",
        action: { type: "DRAW_TURN_START", playerId: onClock },
        clientActionId: "draw-1",
      }),
    );

    const usedSocket = onClock === "alice" ? ws1 : state.sockets[1]!;
    expect(usedSocket.lastError()).toBeNull();
    // State was broadcast: at least one "state" message arrived after the action.
    const states = usedSocket.receivedMessages().filter((m) => m.type === "state");
    expect(states.length).toBeGreaterThan(0);
    // Avoid lint noise from the `actor` alias.
    void actor;
  });

  it("handleAction lazy-rebuilds even if sessions Map is somehow empty", async () => {
    // Defense-in-depth: even if the constructor's restore is bypassed,
    // handleAction should still rebuild from sockets and proceed.
    const { state, ws1, game } = await arrangeMidGame();
    const woken = new (Room as any)(state, makeEnv());
    await new Promise((r) => setTimeout(r, 0));

    // Forcibly clear the sessions Map after construction to mimic a worst-case
    // edge condition where restoration didn't happen for some reason.
    (woken as any).sessions.clear();

    const onClock = game.players[game.currentTurn]!.id;
    const sock = onClock === "alice" ? ws1 : (state.sockets[1] as FakeWebSocket);
    await woken.webSocketMessage(
      sock,
      JSON.stringify({
        type: "action",
        action: { type: "DRAW_TURN_START", playerId: onClock },
        clientActionId: "draw-2",
      }),
    );

    expect(sock.lastError()).toBeNull();
    expect((woken as any).sessions.has(onClock)).toBe(true);
  });
});

// Suppress unused-import warnings; applyAction + initialLobby are pulled in to
// pin the test against the real engine entry points (catches drift if exports
// move).
void applyAction;
void initialLobby;
