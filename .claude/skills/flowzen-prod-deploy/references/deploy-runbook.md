# Flowzen Production Deploy Runbook (Alpic)

## Mental model (simple)

- Skybridge app = your MCP server + widget bundle.
- Alpic = production machine that runs your built app.
- Claude connector = client that calls `POST /mcp` on your Alpic URL.
- OAuth discovery endpoints tell Claude how to authenticate.

If any one of these 4 is wrong, connector setup fails.

## Single production path

1. Validate local code compiles:
   - `pnpm build`
2. Push changes to deployment branch (`main` in this repo):
   - `git add -A`
   - `git commit -m "..."` (if needed)
   - `git push origin main`
3. Wait for Alpic auto-deploy to finish (normally 1-2 min).
4. Use production connector URL:
   - `https://flowzen-mcp-dfdb5406.alpic.live/mcp`
5. Connect Claude/ChatGPT to that URL.

## Production smoke checks (must pass)

Run these checks against production URL (`BASE=https://flowzen-mcp-dfdb5406.alpic.live`):

1. OAuth protected-resource metadata:
   - `curl -fsS "$BASE/.well-known/oauth-protected-resource"`
2. OAuth authorization-server metadata:
   - `curl -fsS "$BASE/.well-known/oauth-authorization-server"`
3. Authorization endpoint compatibility (`/authorize` and `/oauth/authorize`):
   - `curl -i "$BASE/authorize?redirect_uri=https://example.com/callback&state=test"`
   - `curl -i "$BASE/oauth/authorize?redirect_uri=https://example.com/callback&state=test"`
4. MCP route exists (GET returns 405 is acceptable here):
   - `curl -i "$BASE/mcp"`

## Critical env variables

Required for server startup and data access:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional in current architecture:

- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `MCP_SERVER_URL`
- `ANTHROPIC_API_KEY`

## Rules that prevent confusion

- Do not use Cloudflare tunnel URL as production URL.
- Do not debug local tunnel OAuth and Alpic OAuth in one session.
- Do not trust old docs first; confirm with current code in `server/src/index.ts` and `server/src/env.ts`.

