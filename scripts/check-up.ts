// Poll local dev endpoints until both respond, or fail after timeout.
// Used by cloud agents to gate `sim/headless.ts` runs on "is the stack up?"
//
// Run: bun run check:up

const APP = process.env.APP ?? "http://localhost:3000";
const WORKER = process.env.WORKER ?? "http://localhost:8787";
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 60_000);

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    // Any HTTP response = the server is listening. We accept everything,
    // including 404/405 — Next's dev server returns 405 on HEAD /, the
    // worker returns 404 on HEAD /.
    return res.status > 0;
  } catch {
    return false;
  }
}

async function waitFor(url: string, label: string): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    if (await probe(url)) {
      console.log(`✓ ${label} up (${url})`);
      return true;
    }
    await Bun.sleep(250);
  }
  console.error(`✗ ${label} did not respond within ${TIMEOUT_MS}ms (${url})`);
  return false;
}

const [appUp, workerUp] = await Promise.all([
  waitFor(APP, "next"),
  waitFor(WORKER, "worker"),
]);

if (!appUp || !workerUp) process.exit(1);
console.log("ready");
