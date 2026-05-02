# Deploying Realty Royale to Cloudflare

This repo deploys as **two pieces**:

1. **Frontend** (Next.js static export) → **Cloudflare Pages**, Git-connected, auto-deploys on push
2. **Backend** (Worker + DurableObject) → **Cloudflare Workers**, deployed by a GitHub Actions workflow on every push that touches `worker/` or `src/engine/`

Both are free at the scale this game runs at.

---

## One-time setup

### A. Create a Cloudflare account

If you don't have one: <https://dash.cloudflare.com/sign-up>. Email + password, no credit card required.

### B. Get your Account ID + an API token

1. Go to <https://dash.cloudflare.com/> → "Account Home"
2. Copy your **Account ID** (right-side panel)
3. Click "Manage Account" → "Account API Tokens" → "Create Token"
4. Use the **"Edit Cloudflare Workers"** template
5. Copy the generated token

### C. Add secrets to your GitHub repo

In `github.com/chrisMYchen/monopoly-deal/settings/secrets/actions`:

- `CLOUDFLARE_API_TOKEN` — the token from B
- `CLOUDFLARE_ACCOUNT_ID` — the Account ID from B

The `Deploy Worker` workflow (`.github/workflows/deploy-worker.yml`) uses these.

### D. First worker deploy (manual, one-time)

Locally, log into wrangler and run a deploy so Cloudflare provisions the DurableObject migration:

```bash
bun x wrangler login        # opens browser, OAuth
bun run worker:deploy       # runs `wrangler deploy --config worker/wrangler.toml`
```

Output:
```
Deployed realty-royale-worker triggers
  https://realty-royale-worker.<your-subdomain>.workers.dev
```

**Save that URL** — you need it for the frontend env var.

After the first manual deploy, every push to `main` that touches `worker/**` or `src/engine/**` will auto-deploy via the GitHub Actions workflow.

### E. Connect Cloudflare Pages to the GitHub repo

1. <https://dash.cloudflare.com/> → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Authorize Cloudflare to access GitHub if prompted
3. Pick `chrisMYchen/monopoly-deal`
4. Configure the build:
   - **Framework preset**: None (we control the build)
   - **Build command**: `bun install --frozen-lockfile && bun run build`
   - **Build output directory**: `out`
   - **Root directory**: `/`
   - **Environment variable**:
     - `NEXT_PUBLIC_WORKER_ORIGIN` = `https://realty-royale-worker.<your-subdomain>.workers.dev` (the URL from D)
5. Click **Save and Deploy**

Cloudflare builds and publishes. You get a URL like `realty-royale.pages.dev`.

Every push to `main` thereafter rebuilds and redeploys the frontend automatically.

---

## What deploys, when

| Trigger | What runs | Result |
|---|---|---|
| Push to `main` touching `worker/**` or `src/engine/**` | `deploy-worker.yml` | Worker redeployed |
| Push to `main` (any) | Cloudflare Pages built-in | Frontend rebuilt + redeployed |
| Pull request | `ci.yml` | Typecheck + 60 unit tests run |

---

## Custom domain (optional)

To put both at the same origin (e.g. `realtyroyale.com`), add the domain in Cloudflare and:

1. Pages: settings → custom domain → `realtyroyale.com`
2. Worker: bind a route at `realtyroyale.com/api/*` and `realtyroyale.com/r/*/ws`

Then update `NEXT_PUBLIC_WORKER_ORIGIN` to `https://realtyroyale.com` (worker is reachable on the same host).

For now, two-origin (Pages + Workers subdomain) works fine — CORS headers are already in `worker/src/index.ts`.

---

## Local development

This is unchanged by deployment setup:

```bash
# Terminal 1: backend
bun run server:dev          # Bun-native dev server on :8787

# Terminal 2: frontend
bun run dev                 # Next.js on :3000

# Optional terminal 3: protocol scenario tests
bun run test:e2e            # Requires server:dev:inject mode
```
