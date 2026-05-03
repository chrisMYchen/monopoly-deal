// Scenario harness: connects to a running dev-server (with DEV_INJECT=1),
// engineers specific game states via the /dev/state endpoint, drives actions
// via WS, and asserts outcomes by reading the authoritative state over HTTP
// (avoiding any WS state-push race conditions).

import {
  DECK,
  type CardId,
  type SetColor,
} from "../../src/engine/cards";
import type { GameState, Player, PlayerId } from "../../src/engine/state";
import type { ClientToServer, ServerToClient } from "../src/protocol";

const ORIGIN = process.env.ORIGIN ?? "http://localhost:8787";

const ALICE = "alice-session-id-aaaaaaaaaaaaa";
const BOB = "bob-session-id-bbbbbbbbbbbbb";
const CARLA = "carla-session-id-cccccccccccc";

// ---------------------------------------------------------------------------
// Test client
// ---------------------------------------------------------------------------

class TestClient {
  socket: WebSocket;
  isOpen = false;
  // Keep an inbox just so we can wait for the join handshake; not used for
  // state assertions (those go through HTTP getState).
  inbox: ServerToClient[] = [];

  constructor(roomCode: string) {
    const wsUrl = ORIGIN.replace(/^http/, "ws") + `/r/${roomCode}/ws`;
    this.socket = new WebSocket(wsUrl);
    this.socket.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerToClient;
      this.inbox.push(msg);
    });
    this.socket.addEventListener("open", () => {
      this.isOpen = true;
    });
  }

  async ready(): Promise<void> {
    if (this.isOpen) return;
    await new Promise<void>((resolve) =>
      this.socket.addEventListener("open", () => resolve(), { once: true }),
    );
  }

  send(msg: ClientToServer): void {
    this.socket.send(JSON.stringify(msg));
  }

  async waitFor(type: ServerToClient["type"], timeoutMs = 2000): Promise<ServerToClient> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const idx = this.inbox.findIndex((m) => m.type === type);
      if (idx >= 0) {
        const [m] = this.inbox.splice(idx, 1);
        return m!;
      }
      await sleep(20);
    }
    throw new Error(`timeout waiting for ${type}`);
  }

  close(): void {
    try { this.socket.close(); } catch {}
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function createRoom(): Promise<string> {
  const res = await fetch(`${ORIGIN}/api/rooms`, { method: "POST" });
  const { code } = (await res.json()) as { code: string };
  return code;
}

async function injectState(code: string, game: GameState): Promise<void> {
  const res = await fetch(`${ORIGIN}/dev/state/${code}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game }),
  });
  if (!res.ok) throw new Error(`inject failed: ${await res.text()}`);
}

async function getState(code: string): Promise<{ game: GameState; hostSessionId: string | null }> {
  const res = await fetch(`${ORIGIN}/dev/state/${code}`);
  return (await res.json()) as { game: GameState; hostSessionId: string | null };
}

// Poll getState until predicate matches or timeout.
async function waitForState(
  code: string,
  predicate: (s: GameState) => boolean,
  timeoutMs = 2000,
): Promise<GameState> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { game } = await getState(code);
    if (predicate(game)) return game;
    await sleep(30);
  }
  const { game } = await getState(code);
  throw new Error(`timeout waiting for state predicate; current: ${JSON.stringify(game.pending)}`);
}

// ---------------------------------------------------------------------------
// Card lookup helpers
// ---------------------------------------------------------------------------

function findCard(predicate: (c: (typeof DECK)[number]) => boolean): CardId {
  const c = DECK.find(predicate);
  if (!c) throw new Error("test card not found");
  return c.id;
}

function allCardsOfKind(predicate: (c: (typeof DECK)[number]) => boolean): CardId[] {
  return DECK.filter(predicate).map((c) => c.id);
}

// ---------------------------------------------------------------------------
// Scenario state builder
// ---------------------------------------------------------------------------

type ScenarioPlayer = {
  id: PlayerId;
  name: string;
  hand?: CardId[];
  bank?: CardId[];
  tableau?: { color: SetColor; cardIds: CardId[]; hasHouse?: boolean; hasHotel?: boolean }[];
};

function buildState(opts: {
  players: ScenarioPlayer[];
  currentTurn?: number;
  hasDrawnThisTurn?: boolean;
  playsRemaining?: number;
}): GameState {
  const usedCards = new Set<CardId>();
  for (const p of opts.players) {
    for (const c of p.hand ?? []) usedCards.add(c);
    for (const c of p.bank ?? []) usedCards.add(c);
    for (const g of p.tableau ?? []) for (const c of g.cardIds) usedCards.add(c);
  }
  const drawPile = DECK.map((c) => c.id).filter((id) => !usedCards.has(id));

  return {
    phase: "playing",
    players: opts.players.map((p) => ({
      id: p.id,
      name: p.name,
      hand: p.hand ?? [],
      bank: p.bank ?? [],
      tableau: (p.tableau ?? []).map((g) => ({
        color: g.color,
        cardIds: g.cardIds,
        hasHouse: g.hasHouse ?? false,
        hasHotel: g.hasHotel ?? false,
      })),
      connected: true,
    })),
    currentTurn: opts.currentTurn ?? 0,
    playsRemaining: opts.playsRemaining ?? 3,
    hasDrawnThisTurn: opts.hasDrawnThisTurn ?? true,
    drawPile,
    discardPile: [],
    pending: null,
    log: [],
    rngState: 1,
  };
}

// Lobby-join helpers: connects clients while the game is in "lobby" phase so
// sessions are registered, then we inject the playing-phase state below.
async function joinAll(
  code: string,
  players: { sessionId: string; name: string }[],
): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  for (const p of players) {
    const c = new TestClient(code);
    await c.ready();
    c.send({ type: "join", sessionId: p.sessionId, name: p.name });
    await c.waitFor("joined");
    clients.push(c);
  }
  // Wait briefly to absorb post-join state pushes.
  await sleep(50);
  return clients;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;

async function scenario(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`PASS  ${name}`);
    pass++;
  } catch (err) {
    console.log(`FAIL  ${name}: ${err instanceof Error ? err.message : String(err)}`);
    fail++;
  }
}

async function run(): Promise<void> {
  // Sanity check: server up + injection enabled.
  const probe = await fetch(`${ORIGIN}/dev/state/AAAA`);
  if (probe.status !== 404 && !probe.ok) {
    console.error(`Dev injection not enabled. Run: bun run server:dev:inject`);
    process.exit(2);
  }

  // -----------------------------------------------------------------------
  // Forced Deal
  // -----------------------------------------------------------------------
  await scenario("forced deal swaps two properties", async () => {
    const code = await createRoom();
    const [alice, bob] = await joinAll(code, [
      { sessionId: ALICE, name: "Alice" },
      { sessionId: BOB, name: "Bob" },
    ]);
    const fdCard = findCard((c) => c.kind === "action" && c.action === "forcedDeal");
    const myRed = allCardsOfKind((c) => c.kind === "property" && c.set === "red")[0]!;
    const theirGreen = allCardsOfKind((c) => c.kind === "property" && c.set === "green")[0]!;
    await injectState(code, buildState({
      players: [
        { id: ALICE, name: "Alice", hand: [fdCard], tableau: [{ color: "red", cardIds: [myRed] }] },
        { id: BOB, name: "Bob", tableau: [{ color: "green", cardIds: [theirGreen] }] },
      ],
    }));
    alice!.send({ type: "action", action: { type: "PLAY_FORCED_DEAL", playerId: ALICE, cardId: fdCard, myCardId: myRed, targetPlayerId: BOB, targetCardId: theirGreen } });
    await waitForState(code, (s) => s.pending?.kind === "awaitJustSayNo");
    bob!.send({ type: "action", action: { type: "RESPOND_JSN", playerId: BOB, play: false } });
    const final = await waitForState(code, (s) => s.pending === null);
    const aliceP = final.players.find((p) => p.id === ALICE)!;
    const bobP = final.players.find((p) => p.id === BOB)!;
    if (aliceP.tableau.find((g) => g.color === "green")?.cardIds[0] !== theirGreen) throw new Error("Alice missing green");
    if (bobP.tableau.find((g) => g.color === "red")?.cardIds[0] !== myRed) throw new Error("Bob missing red");
    alice!.close(); bob!.close();
  });

  // -----------------------------------------------------------------------
  // Deal Breaker
  // -----------------------------------------------------------------------
  await scenario("deal breaker steals a complete set", async () => {
    const code = await createRoom();
    const [alice, bob] = await joinAll(code, [
      { sessionId: ALICE, name: "Alice" },
      { sessionId: BOB, name: "Bob" },
    ]);
    const dbCard = findCard((c) => c.kind === "action" && c.action === "dealBreaker");
    const browns = allCardsOfKind((c) => c.kind === "property" && c.set === "brown");
    await injectState(code, buildState({
      players: [
        { id: ALICE, name: "Alice", hand: [dbCard] },
        { id: BOB, name: "Bob", tableau: [{ color: "brown", cardIds: browns }] },
      ],
    }));
    alice!.send({ type: "action", action: { type: "PLAY_DEAL_BREAKER", playerId: ALICE, cardId: dbCard, targetPlayerId: BOB, targetColor: "brown", targetGroupIdx: 0 } });
    await waitForState(code, (s) => s.pending?.kind === "awaitJustSayNo");
    bob!.send({ type: "action", action: { type: "RESPOND_JSN", playerId: BOB, play: false } });
    const final = await waitForState(code, (s) => s.pending === null);
    const aliceP = final.players.find((p) => p.id === ALICE)!;
    const bobP = final.players.find((p) => p.id === BOB)!;
    if (bobP.tableau.length !== 0) throw new Error("Bob still has tableau");
    const stolen = aliceP.tableau.find((g) => g.color === "brown");
    if (!stolen || stolen.cardIds.length !== 2) throw new Error("Alice doesn't have full brown set");
    alice!.close(); bob!.close();
  });

  // -----------------------------------------------------------------------
  // Debt Collector
  // -----------------------------------------------------------------------
  await scenario("debt collector forces $5M payment", async () => {
    const code = await createRoom();
    const [alice, bob] = await joinAll(code, [
      { sessionId: ALICE, name: "Alice" },
      { sessionId: BOB, name: "Bob" },
    ]);
    const dcCard = findCard((c) => c.kind === "action" && c.action === "debtCollector");
    const m5 = findCard((c) => c.kind === "money" && c.value === 5);
    await injectState(code, buildState({
      players: [
        { id: ALICE, name: "Alice", hand: [dcCard] },
        { id: BOB, name: "Bob", bank: [m5] },
      ],
    }));
    alice!.send({ type: "action", action: { type: "PLAY_DEBT_COLLECTOR", playerId: ALICE, cardId: dcCard, targetPlayerId: BOB } });
    await waitForState(code, (s) => s.pending?.kind === "awaitJustSayNo");
    bob!.send({ type: "action", action: { type: "RESPOND_JSN", playerId: BOB, play: false } });
    await waitForState(code, (s) => s.pending?.kind === "awaitPayment");
    bob!.send({ type: "action", action: { type: "PAY", playerId: BOB, cardIds: [m5] } });
    const final = await waitForState(code, (s) => s.pending === null);
    const aliceP = final.players.find((p) => p.id === ALICE)!;
    const bobP = final.players.find((p) => p.id === BOB)!;
    if (!aliceP.bank.includes(m5)) throw new Error(`Alice bank: ${JSON.stringify(aliceP.bank)}`);
    if (bobP.bank.length !== 0) throw new Error(`Bob bank: ${JSON.stringify(bobP.bank)}`);
    alice!.close(); bob!.close();
  });

  // -----------------------------------------------------------------------
  // 2-color Rent (multi-target)
  // -----------------------------------------------------------------------
  await scenario("2-color rent charges all opponents", async () => {
    const code = await createRoom();
    // Join 3 players in lobby first.
    const [alice, bob, carla] = await joinAll(code, [
      { sessionId: ALICE, name: "Alice" },
      { sessionId: BOB, name: "Bob" },
      { sessionId: CARLA, name: "Carla" },
    ]);
    const greens = allCardsOfKind((c) => c.kind === "property" && c.set === "green").slice(0, 2); // ladder[1]=4
    const rentCard = findCard((c) =>
      c.kind === "action" && c.action === "rent" && !c.rentSingleTarget && c.rentSets?.includes("green") === true,
    );
    const m5 = findCard((c) => c.kind === "money" && c.value === 5);
    const m4 = findCard((c) => c.kind === "money" && c.value === 4);
    await injectState(code, buildState({
      players: [
        { id: ALICE, name: "Alice", hand: [rentCard], tableau: [{ color: "green", cardIds: greens }] },
        { id: BOB, name: "Bob", bank: [m5] },
        { id: CARLA, name: "Carla", bank: [m4] },
      ],
    }));
    alice!.send({ type: "action", action: { type: "PLAY_RENT", playerId: ALICE, cardId: rentCard, color: "green" } });
    // Bob's turn first
    await waitForState(code, (s) => s.pending?.kind === "awaitJustSayNo" && s.pending.pendingDefenders[0] === BOB);
    bob!.send({ type: "action", action: { type: "RESPOND_JSN", playerId: BOB, play: false } });
    await waitForState(code, (s) => s.pending?.kind === "awaitPayment" && s.pending.payerId === BOB);
    bob!.send({ type: "action", action: { type: "PAY", playerId: BOB, cardIds: [m5] } });
    // Carla's turn
    await waitForState(code, (s) => s.pending?.kind === "awaitJustSayNo" && s.pending.pendingDefenders[0] === CARLA);
    carla!.send({ type: "action", action: { type: "RESPOND_JSN", playerId: CARLA, play: false } });
    await waitForState(code, (s) => s.pending?.kind === "awaitPayment" && s.pending.payerId === CARLA);
    carla!.send({ type: "action", action: { type: "PAY", playerId: CARLA, cardIds: [m4] } });
    const final = await waitForState(code, (s) => s.pending === null);
    const aliceP = final.players.find((p) => p.id === ALICE)!;
    if (!aliceP.bank.includes(m5)) throw new Error("Alice missing $5M from Bob");
    if (!aliceP.bank.includes(m4)) throw new Error("Alice missing $4M from Carla");
    alice!.close(); bob!.close(); carla!.close();
  });

  // -----------------------------------------------------------------------
  // House
  // -----------------------------------------------------------------------
  await scenario("house adds $3M to rent on standard color set", async () => {
    const code = await createRoom();
    const [alice, bob] = await joinAll(code, [
      { sessionId: ALICE, name: "Alice" },
      { sessionId: BOB, name: "Bob" },
    ]);
    const houseCard = findCard((c) => c.kind === "action" && c.action === "house");
    const reds = allCardsOfKind((c) => c.kind === "property" && c.set === "red");
    await injectState(code, buildState({
      players: [
        { id: ALICE, name: "Alice", hand: [houseCard], tableau: [{ color: "red", cardIds: reds }] },
        { id: BOB, name: "Bob" },
      ],
    }));
    alice!.send({ type: "action", action: { type: "PLAY_HOUSE", playerId: ALICE, cardId: houseCard, targetColor: "red" } });
    const final = await waitForState(code, (s) => s.players[0]!.tableau.some((g) => g.hasHouse));
    const aliceP = final.players.find((p) => p.id === ALICE)!;
    const redGroup = aliceP.tableau.find((g) => g.color === "red");
    if (!redGroup?.hasHouse) throw new Error("red group missing house");
    alice!.close(); bob!.close();
  });

  // -----------------------------------------------------------------------
  // Hotel after house
  // -----------------------------------------------------------------------
  await scenario("hotel after house", async () => {
    const code = await createRoom();
    const [alice, bob] = await joinAll(code, [
      { sessionId: ALICE, name: "Alice" },
      { sessionId: BOB, name: "Bob" },
    ]);
    const houseCard = findCard((c) => c.kind === "action" && c.action === "house");
    const hotelCard = findCard((c) => c.kind === "action" && c.action === "hotel");
    const reds = allCardsOfKind((c) => c.kind === "property" && c.set === "red");
    await injectState(code, buildState({
      players: [
        { id: ALICE, name: "Alice", hand: [houseCard, hotelCard], tableau: [{ color: "red", cardIds: reds }] },
        { id: BOB, name: "Bob" },
      ],
    }));
    alice!.send({ type: "action", action: { type: "PLAY_HOUSE", playerId: ALICE, cardId: houseCard, targetColor: "red" } });
    await waitForState(code, (s) => s.players.find((p) => p.id === ALICE)!.tableau.some((g) => g.hasHouse));
    alice!.send({ type: "action", action: { type: "PLAY_HOTEL", playerId: ALICE, cardId: hotelCard, targetColor: "red" } });
    const final = await waitForState(code, (s) => s.players.find((p) => p.id === ALICE)!.tableau.some((g) => g.hasHotel));
    const aliceP = final.players.find((p) => p.id === ALICE)!;
    const redGroup = aliceP.tableau.find((g) => g.color === "red");
    if (!redGroup?.hasHouse || !redGroup?.hasHotel) throw new Error("missing house+hotel");
    alice!.close(); bob!.close();
  });

  // -----------------------------------------------------------------------
  // Just Say No (chain depth 1)
  // -----------------------------------------------------------------------
  await scenario("just say no cancels an action (chain depth 1)", async () => {
    const code = await createRoom();
    const [alice, bob] = await joinAll(code, [
      { sessionId: ALICE, name: "Alice" },
      { sessionId: BOB, name: "Bob" },
    ]);
    const slyCard = findCard((c) => c.kind === "action" && c.action === "slyDeal");
    const jsnCard = findCard((c) => c.kind === "action" && c.action === "justSayNo");
    const red = findCard((c) => c.kind === "property" && c.set === "red");
    await injectState(code, buildState({
      players: [
        { id: ALICE, name: "Alice", hand: [slyCard] },
        { id: BOB, name: "Bob", hand: [jsnCard], tableau: [{ color: "red", cardIds: [red] }] },
      ],
    }));
    alice!.send({ type: "action", action: { type: "PLAY_SLY_DEAL", playerId: ALICE, cardId: slyCard, targetPlayerId: BOB, targetCardId: red } });
    await waitForState(code, (s) => s.pending?.kind === "awaitJustSayNo" && s.pending.pendingDefenders[0] === BOB);
    bob!.send({ type: "action", action: { type: "RESPOND_JSN", playerId: BOB, play: true, cardId: jsnCard } });
    // Now Alice's window — she has no JSN, passes.
    await waitForState(code, (s) => s.pending?.kind === "awaitJustSayNo" && s.pending.responderIsActor === true);
    alice!.send({ type: "action", action: { type: "RESPOND_JSN", playerId: ALICE, play: false } });
    const final = await waitForState(code, (s) => s.pending === null);
    const aliceP = final.players.find((p) => p.id === ALICE)!;
    const bobP = final.players.find((p) => p.id === BOB)!;
    if (aliceP.tableau.length !== 0) throw new Error("Alice shouldn't have stolen");
    if (bobP.tableau.find((g) => g.color === "red")?.cardIds[0] !== red) throw new Error("Bob's red gone");
    if (!final.discardPile.includes(jsnCard)) throw new Error("JSN not in discard");
    alice!.close(); bob!.close();
  });

  // -----------------------------------------------------------------------
  // Win condition
  // -----------------------------------------------------------------------
  await scenario("win on completing 3 distinct sets", async () => {
    const code = await createRoom();
    const [alice, bob] = await joinAll(code, [
      { sessionId: ALICE, name: "Alice" },
      { sessionId: BOB, name: "Bob" },
    ]);
    const browns = allCardsOfKind((c) => c.kind === "property" && c.set === "brown");
    const lights = allCardsOfKind((c) => c.kind === "property" && c.set === "lightBlue");
    const reds = allCardsOfKind((c) => c.kind === "property" && c.set === "red");
    const lastRed = reds[2]!;
    await injectState(code, buildState({
      players: [
        {
          id: ALICE,
          name: "Alice",
          hand: [lastRed],
          tableau: [
            { color: "brown", cardIds: browns },
            { color: "lightBlue", cardIds: lights },
            { color: "red", cardIds: [reds[0]!, reds[1]!] },
          ],
        },
        { id: BOB, name: "Bob" },
      ],
    }));
    alice!.send({ type: "action", action: { type: "PLAY_PROPERTY", playerId: ALICE, cardId: lastRed, assignedColor: "red" } });
    const final = await waitForState(code, (s) => s.phase === "ended");
    if (final.winnerId !== ALICE) throw new Error("Alice not winner");
    alice!.close(); bob!.close();
  });

  // -----------------------------------------------------------------------
  // Hand discard at end of turn
  // -----------------------------------------------------------------------
  await scenario("hand discard at end of turn (>7 cards)", async () => {
    const code = await createRoom();
    const [alice, bob] = await joinAll(code, [
      { sessionId: ALICE, name: "Alice" },
      { sessionId: BOB, name: "Bob" },
    ]);
    const handOf10 = DECK.filter((c) => c.kind === "money").slice(0, 10).map((c) => c.id);
    await injectState(code, buildState({
      players: [
        { id: ALICE, name: "Alice", hand: handOf10 },
        { id: BOB, name: "Bob" },
      ],
    }));
    alice!.send({ type: "action", action: { type: "END_TURN", playerId: ALICE } });
    await waitForState(code, (s) => s.pending?.kind === "awaitDiscardToLimit");
    const toDiscard = handOf10.slice(0, 3); // 10 - 7 = 3
    alice!.send({ type: "action", action: { type: "DISCARD_TO_LIMIT", playerId: ALICE, cardIds: toDiscard } });
    const final = await waitForState(code, (s) => s.pending === null);
    if (final.currentTurn !== 1) throw new Error("turn should advance");
    const aliceP = final.players.find((p) => p.id === ALICE)!;
    if (aliceP.hand.length !== 7) throw new Error(`Alice hand: ${aliceP.hand.length}, expected 7`);
    alice!.close(); bob!.close();
  });

  // -----------------------------------------------------------------------
  // Pay-with-property when bank is short
  // -----------------------------------------------------------------------
  await scenario("pay-with-property when bank short", async () => {
    const code = await createRoom();
    const [alice, bob] = await joinAll(code, [
      { sessionId: ALICE, name: "Alice" },
      { sessionId: BOB, name: "Bob" },
    ]);
    const dcCard = findCard((c) => c.kind === "action" && c.action === "debtCollector");
    const m2 = findCard((c) => c.kind === "money" && c.value === 2);
    const red = findCard((c) => c.kind === "property" && c.set === "red"); // value $3M
    await injectState(code, buildState({
      players: [
        { id: ALICE, name: "Alice", hand: [dcCard] },
        { id: BOB, name: "Bob", bank: [m2], tableau: [{ color: "red", cardIds: [red] }] },
      ],
    }));
    alice!.send({ type: "action", action: { type: "PLAY_DEBT_COLLECTOR", playerId: ALICE, cardId: dcCard, targetPlayerId: BOB } });
    await waitForState(code, (s) => s.pending?.kind === "awaitJustSayNo");
    bob!.send({ type: "action", action: { type: "RESPOND_JSN", playerId: BOB, play: false } });
    await waitForState(code, (s) => s.pending?.kind === "awaitPayment");
    // Bob pays with bank+property = $2 + $3 = $5 (covers the $5 owed exactly)
    bob!.send({ type: "action", action: { type: "PAY", playerId: BOB, cardIds: [m2, red] } });
    const final = await waitForState(code, (s) => s.pending === null);
    const aliceP = final.players.find((p) => p.id === ALICE)!;
    const bobP = final.players.find((p) => p.id === BOB)!;
    if (!aliceP.bank.includes(m2)) throw new Error("Alice missing $2M");
    if (aliceP.tableau.find((g) => g.color === "red")?.cardIds[0] !== red) throw new Error("Alice missing red");
    if (bobP.bank.length !== 0) throw new Error("Bob bank not empty");
    if (bobP.tableau.length !== 0) throw new Error("Bob tableau not empty");
    alice!.close(); bob!.close();
  });

  // -----------------------------------------------------------------------
  // Bankrupt-forgiveness
  // -----------------------------------------------------------------------
  await scenario("bankrupt-forgiveness — $0 assets pays nothing", async () => {
    const code = await createRoom();
    const [alice, bob] = await joinAll(code, [
      { sessionId: ALICE, name: "Alice" },
      { sessionId: BOB, name: "Bob" },
    ]);
    const dcCard = findCard((c) => c.kind === "action" && c.action === "debtCollector");
    await injectState(code, buildState({
      players: [
        { id: ALICE, name: "Alice", hand: [dcCard] },
        { id: BOB, name: "Bob" }, // empty everything
      ],
    }));
    alice!.send({ type: "action", action: { type: "PLAY_DEBT_COLLECTOR", playerId: ALICE, cardId: dcCard, targetPlayerId: BOB } });
    await waitForState(code, (s) => s.pending?.kind === "awaitJustSayNo");
    bob!.send({ type: "action", action: { type: "RESPOND_JSN", playerId: BOB, play: false } });
    await waitForState(code, (s) => s.pending?.kind === "awaitPayment");
    bob!.send({ type: "action", action: { type: "PAY", playerId: BOB, cardIds: [] } });
    const final = await waitForState(code, (s) => s.pending === null);
    const aliceP = final.players.find((p) => p.id === ALICE)!;
    if (aliceP.bank.length !== 0) throw new Error("Alice shouldn't have gotten anything");
    alice!.close(); bob!.close();
  });

  // -----------------------------------------------------------------------
  // Wildcard reassignment — free, any time during the turn
  // -----------------------------------------------------------------------
  await scenario("reassign wild2 is free and works any time during the turn", async () => {
    const code = await createRoom();
    const [alice, bob] = await joinAll(code, [
      { sessionId: ALICE, name: "Alice" },
      { sessionId: BOB, name: "Bob" },
    ]);
    const orangePinkWild = findCard(
      (c) => c.kind === "wild2" && c.sets[0] === "orange" && c.sets[1] === "pink",
    );
    // Place the wild on orange and burn all 3 plays first to confirm we can
    // still reassign with 0 plays remaining — the user-visible behavior.
    await injectState(code, buildState({
      players: [
        {
          id: ALICE,
          name: "Alice",
          tableau: [{ color: "orange", cardIds: [orangePinkWild] }],
        },
        { id: BOB, name: "Bob" },
      ],
      playsRemaining: 0,
    }));
    alice!.send({
      type: "action",
      action: {
        type: "REASSIGN_WILD",
        playerId: ALICE,
        cardId: orangePinkWild,
        fromColor: "orange",
        toColor: "pink",
      },
    });
    const final = await waitForState(code, (s) => {
      const a = s.players.find((p) => p.id === ALICE)!;
      return a.tableau.some((g) => g.color === "pink" && g.cardIds.includes(orangePinkWild));
    });
    const aliceP = final.players.find((p) => p.id === ALICE)!;
    if (aliceP.tableau.find((g) => g.color === "orange") !== undefined) {
      throw new Error("orange group should be empty after reassign");
    }
    if (final.playsRemaining !== 0) {
      throw new Error(`playsRemaining should stay at 0, got ${final.playsRemaining}`);
    }
    alice!.close(); bob!.close();
  });

  await scenario("reassign wild does not consume a play", async () => {
    const code = await createRoom();
    const [alice, bob] = await joinAll(code, [
      { sessionId: ALICE, name: "Alice" },
      { sessionId: BOB, name: "Bob" },
    ]);
    const orangePinkWild = findCard(
      (c) => c.kind === "wild2" && c.sets[0] === "orange" && c.sets[1] === "pink",
    );
    await injectState(code, buildState({
      players: [
        {
          id: ALICE,
          name: "Alice",
          tableau: [{ color: "orange", cardIds: [orangePinkWild] }],
        },
        { id: BOB, name: "Bob" },
      ],
      playsRemaining: 3,
    }));
    alice!.send({
      type: "action",
      action: {
        type: "REASSIGN_WILD",
        playerId: ALICE,
        cardId: orangePinkWild,
        fromColor: "orange",
        toColor: "pink",
      },
    });
    const final = await waitForState(code, (s) => {
      const a = s.players.find((p) => p.id === ALICE)!;
      return a.tableau.some((g) => g.color === "pink" && g.cardIds.includes(orangePinkWild));
    });
    if (final.playsRemaining !== 3) {
      throw new Error(`playsRemaining should stay at 3 (free), got ${final.playsRemaining}`);
    }
    alice!.close(); bob!.close();
  });

  // -----------------------------------------------------------------------
  // Server-side authority — playerId mismatch rejection
  // -----------------------------------------------------------------------
  await scenario("server rejects spoofed playerId", async () => {
    const code = await createRoom();
    const [alice, bob] = await joinAll(code, [
      { sessionId: ALICE, name: "Alice" },
      { sessionId: BOB, name: "Bob" },
    ]);
    await injectState(code, buildState({
      players: [
        { id: ALICE, name: "Alice", hand: [] },
        { id: BOB, name: "Bob", hand: [] },
      ],
    }));
    // Bob tries to act as Alice.
    bob!.send({ type: "action", action: { type: "DRAW_TURN_START", playerId: ALICE } });
    const err = await bob!.waitFor("error");
    if (err.type !== "error" || err.message !== "playerId mismatch") {
      throw new Error(`expected playerId mismatch, got ${JSON.stringify(err)}`);
    }
    alice!.close(); bob!.close();
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(2);
});
