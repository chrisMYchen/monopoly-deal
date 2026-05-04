"use client";

import { useDroppable } from "@dnd-kit/core";

// Generic droppable wrapper. Highlights with a soft pulse when a draggable is
// hovering over it. Used for self-properties, self-bank, opponent chips, and the
// end-of-turn discard target.

export function DropZone({
  id,
  data,
  active,
  children,
  className,
  hoverClassName,
  ariaLabel,
}: {
  id: string;
  // Free-form payload passed to onDragEnd for action routing.
  data?: Record<string, unknown>;
  // Caller can set `active=false` to disable the drop target without unmounting.
  active?: boolean;
  children: React.ReactNode;
  className?: string;
  hoverClassName?: string;
  ariaLabel?: string;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data,
    disabled: active === false,
  });
  return (
    <div
      ref={setNodeRef}
      aria-label={ariaLabel}
      className={[
        className ?? "",
        "transition-all duration-150",
        active === false ? "opacity-100" : "",
        isOver
          ? hoverClassName ?? "ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-felt)]"
          : "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
