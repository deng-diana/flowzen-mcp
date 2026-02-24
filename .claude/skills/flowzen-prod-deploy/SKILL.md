---
name: flowzen-prod-deploy
description: Deploy and troubleshoot the Flowzen Skybridge MCP app in production on Alpic (not local Cloudflare tunnel). Use when the user is confused about local-vs-prod paths, Claude/ChatGPT connector auth failures, OAuth discovery issues, Alpic build failures, or wants a repeatable production runbook.
---

# Flowzen Production Deploy Skill

Use this skill to keep one clear path: **Alpic production**.
Do not mix production diagnosis with local Cloudflare tunnel diagnosis in the same checklist.

## Quick workflow

1. Read `references/deploy-runbook.md` and follow the exact order.
2. If any step fails, map symptom in `references/failure-playbook.md`.
3. Apply the smallest fix, then re-run smoke checks before changing anything else.

## Ground rules

- Treat `https://<your-alpic-domain>/mcp` as the production connector URL.
- Use local tunnel only for local debugging, never as production evidence.
- Prefer `git push origin main` as deploy trigger for this repo.
- Run `pnpm build` before pushing if deployment is blocked or unstable.

## Repo-specific truth sources

- Deployment trigger and production URL notes: `CLAUDE.md`
- Server auth and OAuth routes: `server/src/index.ts`
- MCP route transport behavior: `server/src/middleware.ts`
- Env requirements: `server/src/env.ts`
- Tool schema and auth fallback behavior: `server/src/server.ts`

