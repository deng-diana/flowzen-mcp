# Flowzen Failure Playbook (from repo history)

## 1) Symptom: Claude connector auth/connect fails

- Typical cause:
  - Missing OAuth discovery endpoints, or incomplete OAuth route support.
- Evidence:
  - `2026-02-22` commit `3586848` added OAuth discovery endpoints.
  - `2026-02-22` commit `f155d15` added self-contained `/oauth/authorize` + `/oauth/token`.
  - `2026-02-22` commit `7c9f004` fixed base URL derivation for proxy/tunnel.
  - `2026-02-23` commit `bcff9dc` added `/authorize` compatibility route.
- Fix pattern:
  - Verify all required endpoints exist in `server/src/index.ts`.
  - Verify metadata URLs point to the same domain used by connector.

## 2) Symptom: Works locally, fails on Alpic

- Typical cause:
  - Hardcoded server URL or wrong host inference behind proxy.
- Evidence:
  - `2026-02-22` commit `7c9f004` changed OAuth base URL to derive from request host headers.
- Fix pattern:
  - Avoid hardcoded domain in OAuth metadata.
  - Keep `getBaseUrl()` logic and trust `x-forwarded-*` headers.

## 3) Symptom: Deploy succeeds but app is unavailable / cold-start crash

- Typical cause:
  - Environment validation required vars that are no longer used.
- Evidence:
  - `2026-02-22` commit `6efaac6` made Clerk vars optional after Clerk auth removal.
- Fix pattern:
  - Keep required env minimal (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
  - Make non-critical integrations optional.

## 4) Symptom: Alpic build keeps failing

- Typical cause:
  - TypeScript strict setting (`noUnusedLocals`) blocks build.
- Evidence:
  - `2026-02-22` commit `b61a1c4` removed unused `done` variable causing TS6133.
- Fix pattern:
  - Always run `pnpm build` before push.
  - Treat TypeScript warnings as release blockers in this repo.

## 5) Symptom: Connector says "Unclear Arguments"

- Typical cause:
  - Tool action schema too loose/ambiguous.
- Evidence:
  - `2026-02-22` commit `1ba7716` changed action schema to discriminated union.
- Fix pattern:
  - Use strict per-action schema with explicit required fields.

## 6) Symptom: Widget white screen / React maximum update depth

- Typical cause:
  - Feedback loop between `setWidgetState`, `output`, and effect re-runs.
- Evidence:
  - `2026-02-22` commits `5e3d73e`, `313181f`, `1ddbba4` progressively fixed React loop issues.
- Fix pattern:
  - Apply `callToolAsync` result directly.
  - Avoid effect patterns that write state on every output change.

## 7) Symptom: Task state inconsistent (done/todo mismatch)

- Typical cause:
  - Dual source of truth (`status` + `completed`).
- Evidence:
  - `2026-02-21` commit `66056d9` removed `status` column and standardized on `completed`.
- Fix pattern:
  - Keep exactly one source of truth for task completion.

## 8) Symptom: Team confused about deploy method

- Typical cause:
  - Docs drift: one file says auto-deploy on push, another says manual deploy command.
- Evidence:
  - `CLAUDE.md` says push to `main` triggers Alpic deploy.
  - `README.md` still shows `pnpm deploy`.
- Fix pattern:
  - Define one canonical deployment path and keep docs aligned.

## 9) Symptom: MCP initialize works, but OAuth well-known endpoints are 404

- Typical cause:
  - Production runtime is serving MCP tool traffic but not exposing custom OAuth routes from `server/src/index.ts`.
- Evidence pattern:
  - `POST /mcp` initialize succeeds (`200`, `serverInfo.name = flowzen`).
  - `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` return `404`.
- Fix pattern:
  - Verify which entrypoint Alpic actually runs for production.
  - Ensure production process starts `dist/index.js` if OAuth routes are defined there.
  - Re-run smoke checks immediately after each deployment.
