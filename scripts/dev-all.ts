// Spawn Next dev (:3000) and the bun dev-server with DEV_INJECT (:8787) as
// one process group, multiplex their stdout/stderr with [next]/[wkr] tags,
// and forward signals so ctrl-c stops both cleanly.
//
// Run: bun run dev:all

const COLORS = {
  next: "\x1b[36m",
  wkr: "\x1b[33m",
  reset: "\x1b[0m",
} as const;

type Tag = "next" | "wkr";

function spawn(tag: Tag, cmd: string[], env: Record<string, string> = {}) {
  const proc = Bun.spawn(cmd, {
    env: { ...process.env, ...env, FORCE_COLOR: "1" },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  pipeWithPrefix(tag, proc.stdout);
  pipeWithPrefix(tag, proc.stderr);
  return proc;
}

async function pipeWithPrefix(tag: Tag, stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const color = COLORS[tag];
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.length > 0) console.log(`${color}[${tag}]${COLORS.reset} ${line}`);
    }
  }
  if (buf.length > 0) console.log(`${color}[${tag}]${COLORS.reset} ${buf}`);
}

const next = spawn("next", ["bun", "run", "dev"]);
const wkr = spawn("wkr", ["bun", "worker/src/dev-server.ts"], {
  DEV_INJECT: "1",
  PORT: "8787",
});

const shutdown = (sig: NodeJS.Signals) => {
  console.log(`\n[dev:all] ${sig} — shutting down`);
  try { next.kill(); } catch {}
  try { wkr.kill(); } catch {}
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const codes = await Promise.all([next.exited, wkr.exited]);
const exit = codes.find((c) => c !== 0) ?? 0;
process.exit(exit);
