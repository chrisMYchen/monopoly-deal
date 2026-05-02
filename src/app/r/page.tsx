"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { GameRoom } from "@/components/GameRoom";

// Room route — code is passed as `?code=XYZ` so this works with Next.js static
// export (no dynamic route segments). Cloudflare Pages / GitHub Pages / etc.
// all serve this single static page.

function RoomInner() {
  const params = useSearchParams();
  const code = (params?.get("code") ?? "").toUpperCase();
  if (!code) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-8 text-center">
        <p className="opacity-70">No room code in URL.</p>
      </main>
    );
  }
  return <GameRoom roomCode={code} />;
}

export default function RoomPage() {
  return (
    <Suspense fallback={null}>
      <RoomInner />
    </Suspense>
  );
}
