// Thin wrapper around the gstack browse CLI.
//
// The gstack daemon talks Playwright under the hood; we drive it through
// stdout-only $B commands so the harness stays in the same toolstack as
// /qa, /design-review, etc. Daemon spins up on first call (~3s), subsequent
// calls round-trip in ~100-200ms.

const BROWSE =
  process.env.BROWSE_BIN ??
  `${process.env.HOME}/.claude/skills/gstack/browse/dist/browse`;

export async function $b(...args: string[]): Promise<string> {
  const p = Bun.spawn([BROWSE, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (code !== 0) {
    throw new Error(`$b ${args.join(" ")} exited ${code}\n${stderr}`);
  }
  return stdout;
}

// $b without throwing — returns { code, stdout, stderr }.
export async function $bRaw(
  ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  const p = Bun.spawn([BROWSE, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  return { code: typeof code === "number" ? code : 1, stdout, stderr };
}

// Open a fresh tab at `url` and return its tab id.
export async function newTab(url: string): Promise<number> {
  const out = (await $b("newtab", url, "--json")).trim();
  // Output may be either {"tabId":N,...} or just "Tab N opened: ..." plain text.
  try {
    const obj = JSON.parse(out);
    if (typeof obj?.tabId === "number") return obj.tabId;
  } catch {
    // fall through to text parse
  }
  const m = out.match(/(?:tab\s*)?#?\s*(\d+)/i);
  if (!m) throw new Error(`could not parse tab id from: ${out}`);
  return Number(m[1]);
}

export async function listTabs(): Promise<string> {
  return $b("tabs");
}

export async function switchTo(tabId: number): Promise<void> {
  await $b("tab", String(tabId));
}

// Run JS in a specific tab. Switches to the tab first.
export async function runJs<T = unknown>(tabId: number, js: string): Promise<T> {
  await switchTo(tabId);
  // `js` accepts an arbitrary expression and auto-awaits the top-level result.
  // We wrap with Promise chains (not an async IIFE — gstack's `js` evaluator
  // returns empty stdout for block-form `async () => { return … }`, so we
  // build the wrapper as a single expression). Returns a JSON-encoded
  // {ok,v|err} on success or error.
  const expr = `JSON.stringify(await Promise.resolve((${js})).then(v=>({ok:true,v})).catch(e=>({ok:false,err:String(e&&e.message||e)})))`;
  const out = (await $b("js", expr)).trim();
  // Output is wrapped in `=> ...` or similar by the CLI; locate the JSON.
  const start = out.indexOf("{");
  const json = start >= 0 ? out.slice(start) : out;
  let parsed: { ok: boolean; v?: T; err?: string };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`runJs: could not parse output\n${out}`);
  }
  if (!parsed.ok) throw new Error(`runJs error: ${parsed.err}`);
  return parsed.v as T;
}

// Take a screenshot of a specific tab.
export async function screenshot(tabId: number, path: string): Promise<void> {
  await switchTo(tabId);
  await $b("screenshot", path);
}
