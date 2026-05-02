// Where the worker lives. In production this is the public Cloudflare Workers
// origin; locally we run `wrangler dev` on 8787.

export function getWorkerOrigin(): string {
  if (typeof window !== "undefined") {
    const fromAttr = document.documentElement.getAttribute("data-worker-origin");
    if (fromAttr) return fromAttr;
  }
  return process.env.NEXT_PUBLIC_WORKER_ORIGIN || "http://localhost:8787";
}
