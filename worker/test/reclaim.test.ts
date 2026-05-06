// Regression tests for the back-arrow / lost-session-id reconnect path.
//
// The bug: if a player's persisted sessionId was wiped between leaving and
// re-entering an in-progress game (cleared storage, fresh tab on a shared
// link, mobile memory eviction), the worker rejected them with "game already
// in progress" because the reconnect path matched only on sessionId.
//
// The fix: handleJoin reclaims a *single disconnected player whose name
// matches* the joining display name and binds the new sessionId to that
// seat. These tests pin the behavior, including the cases where reclaim must
// REFUSE — ambiguous matches, attempts to steal a connected seat, and
// non-matching names.
//
// Also covers the post-hibernation rebuild for reclaimed seats: the new
// sessionId no longer equals player.id, so the SocketAttachment must carry
// playerId for `restoreSessionsFromSockets` to reconnect on wake.

import { describe, expect, it } from "vitest";
import { produce } from "immer";

import type { GameState } from "../../src/engine/state";
import type { ServerToClient } from "../src/protocol";
import { Room, type Env } from "../src/index";

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
  receivedMessages(): ServerToClient[] {
    return this.sent.map((s) => JSON.parse(s) as ServerToClient);
  }
  lastError(): string | null {
    const errs = this.receivedMessages().filter((m) => m.type === "error");
    return errs.length ? (errs[errs.length - 1] as { message: string }).message : null;
  }
  lastJoined(): { playerId: string; isHost: boolean } | null {
    const joined = this.receivedMessages().filter((m) => m.type === "joined");
    return joined.length ? (joined[joined.length - 1] as any) : null;
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
    // Mirror Cloudflare's behavior: closed sockets are dropped from the list.
    return this.sockets.filter((ws) => !ws.closed);
  }
}

function makeEnv(): Env {
  return { ROOM: undefined as unknown as DurableObjectNamespace };
}

async function tick(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

// Stand up a fresh Room with two players in an in-progress game. Returns the
// raw fakes so tests can drive the reclaim path directly.
async function arrangeMidGame(): Promise<{
  state: FakeState;
  room: any;
  ws1: FakeWebSocket;
  ws2: FakeWebSocket;
  game: GameState;
}> {
  const state = new FakeState();
  const room = new (Room as any)(state, makeEnv());
  await tick();

  const ws1 = new FakeWebSocket();
  const ws2 = new FakeWebSocket();
  state.acceptWebSocket(ws1);
  state.acceptWebSocket(ws2);

  await room.webSocketMessage(
    ws1,
    JSON.stringify({ type: "join", sessionId: "sid-alice", name: "Alice" }),
  );
  await room.webSocketMessage(
    ws2,
    JSON.stringify({ type: "join", sessionId: "sid-bob", name: "Bob" }),
  );
  await room.webSocketMessage(
    ws1,
    JSON.stringify({ type: "start", rngSeed: 42 }),
  );
  await tick();

  const game = (await state.storage.get<GameState>("game"))!;
  return { state, room, ws1, ws2, game };
}

describe("reclaim by name", () => {
  it("lets a disconnected player back in via a NEW sessionId when the name matches", async () => {
    const { state, room, ws1, ws2 } = await arrangeMidGame();

    // Alice's tab loses its sessionStorage. Her socket closes.
    await room.webSocketClose(ws1, 1000, "client close", true);
    await tick();

    const game = (await state.storage.get<GameState>("game"))!;
    expect(game.players.find((p) => p.id === "sid-alice")?.connected).toBe(false);

    // She re-enters the link in a fresh tab — new sessionId, same name.
    const ws3 = new FakeWebSocket();
    state.acceptWebSocket(ws3);
    await room.webSocketMessage(
      ws3,
      JSON.stringify({ type: "join", sessionId: "sid-alice-2", name: "Alice" }),
    );

    // No error. The "joined" message keeps her ORIGINAL playerId so existing
    // game state references (pending payments, log lines, etc.) don't drift.
    expect(ws3.lastError()).toBeNull();
    expect(ws3.lastJoined()?.playerId).toBe("sid-alice");

    // The seat is connected again, the new session is mapped to the old
    // playerId, and the attachment carries both ids so post-hibernation
    // restore can re-link this socket.
    const game2 = (await state.storage.get<GameState>("game"))!;
    expect(game2.players.find((p) => p.id === "sid-alice")?.connected).toBe(true);
    const sessions = (room as any).sessions as Map<string, { playerId: string }>;
    expect(sessions.get("sid-alice-2")?.playerId).toBe("sid-alice");
    const att = ws3.deserializeAttachment() as { sessionId: string; playerId: string };
    expect(att.sessionId).toBe("sid-alice-2");
    expect(att.playerId).toBe("sid-alice");
    void ws2; // silence unused warning
  });

  it("transfers host to the new sessionId when the reclaimed seat was host", async () => {
    const { state, room, ws1 } = await arrangeMidGame();
    expect((room as any).hostSessionId).toBe("sid-alice");

    await room.webSocketClose(ws1, 1000, "client close", true);
    await tick();

    const ws3 = new FakeWebSocket();
    state.acceptWebSocket(ws3);
    await room.webSocketMessage(
      ws3,
      JSON.stringify({ type: "join", sessionId: "sid-alice-2", name: "Alice" }),
    );

    expect(ws3.lastJoined()?.isHost).toBe(true);
    expect((room as any).hostSessionId).toBe("sid-alice-2");
  });

  it("REFUSES to steal a CONNECTED seat — falls through to 'game already in progress'", async () => {
    const { state, room } = await arrangeMidGame();

    // Both Alice and Bob are still connected.
    const wsImpostor = new FakeWebSocket();
    state.acceptWebSocket(wsImpostor);
    await room.webSocketMessage(
      wsImpostor,
      JSON.stringify({ type: "join", sessionId: "sid-impostor", name: "Alice" }),
    );

    expect(wsImpostor.lastError()).toBe("game already in progress");
    expect(wsImpostor.lastJoined()).toBeNull();
  });

  it("REFUSES when two disconnected players share the same name (ambiguous)", async () => {
    const state = new FakeState();
    const room = new (Room as any)(state, makeEnv());
    await tick();

    // Three-player lobby with two Alices, then start.
    const wsA1 = new FakeWebSocket();
    const wsA2 = new FakeWebSocket();
    const wsHost = new FakeWebSocket();
    state.acceptWebSocket(wsA1);
    state.acceptWebSocket(wsA2);
    state.acceptWebSocket(wsHost);
    await room.webSocketMessage(
      wsHost,
      JSON.stringify({ type: "join", sessionId: "sid-host", name: "Host" }),
    );
    await room.webSocketMessage(
      wsA1,
      JSON.stringify({ type: "join", sessionId: "sid-a1", name: "Alice" }),
    );
    await room.webSocketMessage(
      wsA2,
      JSON.stringify({ type: "join", sessionId: "sid-a2", name: "Alice" }),
    );
    await room.webSocketMessage(
      wsHost,
      JSON.stringify({ type: "start", rngSeed: 7 }),
    );
    await tick();

    // Both Alices vanish.
    await room.webSocketClose(wsA1, 1000, "", true);
    await room.webSocketClose(wsA2, 1000, "", true);
    await tick();

    const wsX = new FakeWebSocket();
    state.acceptWebSocket(wsX);
    await room.webSocketMessage(
      wsX,
      JSON.stringify({ type: "join", sessionId: "sid-newcomer", name: "Alice" }),
    );

    // Server can't pick between two disconnected Alices; refuse rather than
    // bind to the wrong seat.
    expect(wsX.lastError()).toBe("game already in progress");
    expect(wsX.lastJoined()).toBeNull();
  });

  it("kicks an older socket attached to the same seat (reclaim collapses to one socket)", async () => {
    const { state, room, ws1 } = await arrangeMidGame();

    // Reclaim from a fresh tab WITHOUT first triggering Alice's webSocketClose.
    // Mirrors a phone tab silently dying — the DO didn't get a clean close, so
    // ws1 is still in getWebSockets() at the moment of reclaim.
    expect(ws1.closed).toBe(false);
    // Force Alice to read as disconnected so the reclaim path is eligible —
    // in production webSocketClose normally sets this; here we set it
    // directly to avoid mocking close semantics. The stored state is frozen
    // by Immer, so we have to produce a new draft.
    const stored = (await state.storage.get<GameState>("game"))!;
    const draft = produce(stored, (g) => {
      const p = g.players.find((pl) => pl.id === "sid-alice");
      if (p) p.connected = false;
    });
    await state.storage.put("game", draft);
    (room as any).game = draft;

    const ws3 = new FakeWebSocket();
    state.acceptWebSocket(ws3);
    await room.webSocketMessage(
      ws3,
      JSON.stringify({ type: "join", sessionId: "sid-alice-2", name: "Alice" }),
    );

    // Reclaim succeeded AND ws1 was closed by the kick step so we never have
    // two live sockets broadcasting state for the same seat.
    expect(ws3.lastError()).toBeNull();
    expect(ws1.closed).toBe(true);
  });
});

describe("post-hibernation restore for reclaimed seats", () => {
  it("rebuilds the sessions Map using attachment.playerId after a reclaim", async () => {
    const { state, room, ws1 } = await arrangeMidGame();

    await room.webSocketClose(ws1, 1000, "client close", true);
    await tick();

    const ws3 = new FakeWebSocket();
    state.acceptWebSocket(ws3);
    await room.webSocketMessage(
      ws3,
      JSON.stringify({ type: "join", sessionId: "sid-alice-2", name: "Alice" }),
    );
    await tick();

    // Hibernation: drop the Room instance. The FakeState's sockets persist.
    const woken = new (Room as any)(state, makeEnv());
    await tick();

    const sessions = (woken as any).sessions as Map<string, { playerId: string }>;
    // Without playerId on the attachment, restore would assume
    // sid-alice-2 === player.id and find no player, leaving the seat
    // unreachable post-wake. With it, the mapping is restored faithfully.
    expect(sessions.get("sid-alice-2")?.playerId).toBe("sid-alice");

    // And — the regression — an action message right after wake reaches the
    // engine instead of throwing "session has no player".
    const game = (await state.storage.get<GameState>("game"))!;
    if (game.players[game.currentTurn]!.id === "sid-alice") {
      await woken.webSocketMessage(
        ws3,
        JSON.stringify({
          type: "action",
          action: { type: "DRAW_TURN_START", playerId: "sid-alice" },
          clientActionId: "draw-after-reclaim",
        }),
      );
      expect(ws3.lastError()).toBeNull();
    }
  });
});
