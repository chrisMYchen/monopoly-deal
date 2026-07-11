"use client";

// Deck reference — every distinct card face in the 110-card deck, with copy
// counts, at all render sizes, plus a hand-fan overlap strip. Doubles as a
// player-facing "what's in the deck" page (the composition is public — it's
// printed on the real box) and as a card-face design gallery: iterate on a
// face in Card.tsx and judge it here without playing a whole game.

import Link from "next/link";

import { Card } from "@/components/Card";
import { Wordmark } from "@/components/ui/Wordmark";
import {
  DECK,
  countInDeck,
  type Card as CardData,
} from "@/engine/cards";

// Live composition counts, derived from the deck so the footer can't drift
// from cards.ts (assertDeckTotals guards the deck, not display copy).
const COMPOSITION = DECK.reduce(
  (acc, c) => {
    if (c.kind === "money") acc.money++;
    else if (c.kind === "property") acc.properties++;
    else if (c.kind === "wild2" || c.kind === "wild10") acc.wilds++;
    else acc.actions++;
    return acc;
  },
  { money: 0, properties: 0, wilds: 0, actions: 0 },
);

// One representative per functionally-identical group, in a stable, readable
// order: money → properties → wilds → actions → rents.
function distinctCards(): { card: CardData; copies: number }[] {
  const seen = new Set<string>();
  const out: { card: CardData; copies: number }[] = [];
  for (const card of DECK) {
    const key = identityKey(card);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ card, copies: countInDeck(card) });
  }
  return out;
}

function identityKey(card: CardData): string {
  switch (card.kind) {
    case "money":
      return `money-${card.value}`;
    case "property":
      // Show every named deed — the names are half the charm.
      return `property-${card.id}`;
    case "wild2":
      return `wild2-${card.sets.join("-")}`;
    case "wild10":
      return "wild10";
    case "action":
      if (card.action === "rent") {
        return `rent-${card.rentSingleTarget ? "wild" : (card.rentSets ?? []).join("-")}`;
      }
      return `action-${card.action}`;
  }
}

function sectionOf(card: CardData): string {
  switch (card.kind) {
    case "money":
      return "Money";
    case "property":
      return "Properties";
    case "wild2":
    case "wild10":
      return "Property wilds";
    case "action":
      return card.action === "rent" ? "Rent" : "Actions";
  }
}

const SECTIONS = ["Money", "Properties", "Property wilds", "Actions", "Rent"];

export default function CardsPage() {
  const groups = distinctCards();
  const fanSample = [
    groups.find((g) => g.card.kind === "property"),
    groups.find((g) => g.card.kind === "action" && g.card.action === "rent" && !g.card.rentSingleTarget),
    groups.find((g) => g.card.kind === "money"),
    groups.find((g) => g.card.kind === "wild2"),
    groups.find((g) => g.card.kind === "action" && g.card.action === "justSayNo"),
    groups.find((g) => g.card.kind === "action" && g.card.action === "rent" && g.card.rentSingleTarget),
    groups.find((g) => g.card.kind === "property" && g.card.set === "darkBlue"),
  ].filter((g): g is NonNullable<typeof g> => g != null);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-baseline gap-3">
        <Link href="/">
          <Wordmark />
        </Link>
        <span className="text-sm text-[var(--color-ink-soft)]">
          Deck reference · 110 cards
        </span>
      </header>

      {/* Fan-overlap strip: judges sliver legibility — what a heavily
          overlapped hand actually shows of each card. */}
      <section className="mb-8">
        <h2 className="mb-2 font-display text-lg font-semibold text-[var(--color-ink)]">
          Fan overlap check
        </h2>
        <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
          A full hand overlaps down to a 22px sliver per card. Color identity
          must survive this.
        </p>
        <div className="surface-felt rounded-xl p-4">
          <div className="relative h-[140px]" style={{ width: 100 + 22 * (fanSample.length - 1) }}>
            {fanSample.map((g, i) => (
              <div key={identityKey(g.card)} className="absolute top-0" style={{ left: i * 22, zIndex: i + 1 }}>
                <Card cardId={g.card.id} size="md" animated={false} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {SECTIONS.map((section) => (
        <section key={section} className="mb-8">
          <h2 className="mb-3 font-display text-lg font-semibold text-[var(--color-ink)]">
            {section}
          </h2>
          <div className="flex flex-wrap gap-4">
            {groups
              .filter((g) => sectionOf(g.card) === section)
              .map(({ card, copies }) => (
                <figure key={identityKey(card)} className="flex flex-col items-center gap-1">
                  <Card cardId={card.id} size="md" animated={false} />
                  <figcaption className="tabular text-[11px] text-[var(--color-ink-soft)]">
                    ×{copies}
                  </figcaption>
                </figure>
              ))}
          </div>
        </section>
      ))}

      {/* Size sweep for one card of each kind — catches size-specific layout
          breakage when iterating on faces. */}
      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg font-semibold text-[var(--color-ink)]">
          Size sweep
        </h2>
        <div className="flex flex-wrap items-end gap-4">
          {fanSample.map((g) =>
            (["sm", "md", "lg"] as const).map((size) => (
              <Card key={`${identityKey(g.card)}-${size}`} cardId={g.card.id} size={size} animated={false} />
            )),
          )}
        </div>
      </section>

      <p className="text-xs text-[var(--color-ink-faint)]">
        Composition: {COMPOSITION.money} money · {COMPOSITION.properties} properties ·{" "}
        {COMPOSITION.wilds} wilds · {COMPOSITION.actions} actions ({DECK.length} total).
        The discard pile is public in play — counting what&apos;s left is up to you.
      </p>
    </main>
  );
}
