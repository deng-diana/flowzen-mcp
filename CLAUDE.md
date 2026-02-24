# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Before writing code, first explore the project structure, then invoke the `mcp-app-builder` skill for framework documentation.

---

## Deployment — IMPORTANT

**git commit + push = 自动部署（热更新）**

```bash
git add <files>
git commit -m "your message"
git push origin main   # ← 这一步触发 Alpic CI/CD，自动 build + deploy
```

Push 到 `main` 后 1–2 分钟生效。**不需要手动运行 `pnpm deploy` 或 `alpic deploy`**。

Production URL: `https://flowzen-mcp-dfdb5406.alpic.live/mcp`

---

## Commands

```bash
pnpm dev          # Start dev server at http://localhost:3000 (Skybridge devtools at root)
pnpm build        # Build locally to verify (optional before commit)
pnpm start        # Start production server locally

# Supabase
supabase link                    # Link to remote project (once)
supabase db push                 # Apply migrations to remote DB
supabase db reset --linked       # Reset remote DB (destructive)
supabase migration new <name>    # Create a new migration file

# Tunnel for ChatGPT/Claude testing against local dev server
cloudflared tunnel --url http://localhost:3000
# Then add https://<tunnel>.trycloudflare.com/mcp in Claude/ChatGPT settings
```

No test suite is configured. No linting scripts are defined in `package.json`.

---

## Architecture

This is a **Skybridge MCP app** — an MCP server that exposes tools and a React widget to AI assistants (Claude, ChatGPT). Two users consume the app simultaneously: the human interacts with the widget, the AI sees its state via structured content.

### Request Flow

``` 
AI Assistant → POST /mcp → Express → McpServer
  → executeActions() on Supabase → fetchTasks() → recommendation engine
  → returns { structuredContent: { tasks, recommendation, reason, reward, timeContext } }
                                                           ↓
                                               React widget reads & renders
```

### Server (`server/src/`)

| File | Role |
|------|------|
| `index.ts` | Express app setup, OAuth discovery/auth endpoints, Skybridge devtools — **do not modify** |
| `middleware.ts` | MCP HTTP transport wiring — **do not modify** |
| `env.ts` | Validated env vars via `@t3-oss/env-core` + zod |
| `supabase.ts` | All DB operations (`fetchTasks`, `executeActions`) — **do not modify** |
| `server.ts` | MCP tool definition, recommendation engine, neuroscience reasons, rewards |

The MCP tool is registered as widget `"flowzen"` on a `McpServer` from `skybridge/server`. The app exposes OAuth discovery + token endpoints in `index.ts`. Tool handlers currently default `userId` to `"dev-user-demo"` when auth info is absent.

### Frontend (`web/src/`)

| File | Role |
|------|------|
| `widgets/flowzen.tsx` | Main widget — all UI logic lives here |
| `index.css` | All styles (no CSS modules, no Tailwind) |
| `helpers.ts` | `useToolInfo`, `useCallTool` hooks from Skybridge |
| `components/types.ts` | `Task` type |
| `components/LoadingScreen.tsx` | Loading state component |

The widget uses Skybridge hooks:
- `useToolInfo<"flowzen">()` — reactive server output (`output`, `isPending`)
- `useCallTool("flowzen")` — call the MCP tool (`callToolAsync`)
- `useWidgetState<T>()` — persisted widget state (survives re-renders, visible to LLM)
- `useLayout()` — provides `maxHeight`, `theme` (`"dark"` | `"light"`)

Optimistic updates pattern: mutate `widgetState` immediately, then call `syncWithServer()` which calls `callToolAsync` and reconciles with the server response.

### Database Schema

`tasks` table:
- `id` (uuid), `user_id` (text), `title` (text), `completed` (bool)
- `priority` — `"low"` | `"medium"` | `"high"`
- `difficulty` — `"easy"` | `"medium"` | `"hard"`
- `due_date` (date, nullable), `created_at` (timestamptz)

RLS is enabled. All queries use the service role key and filter by `user_id`.

### Recommendation Engine (in `server.ts`)

Hybrid logic:
1. Rule-based fallback computes recommendation/reason/reward
2. If `ANTHROPIC_API_KEY` exists, LLM recommendation can override fallback
3. Recommendation/completion telemetry is logged in `recommendation_log` and `user_completion_events`

### Environment Variables

Required in `.env`:
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Optional:
```
ANTHROPIC_API_KEY
MCP_SERVER_URL
CLERK_SECRET_KEY
CLERK_PUBLISHABLE_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
```

### Key Constraints

- **Do not modify** `server/src/index.ts`, `server/src/middleware.ts`, `server/src/supabase.ts`
- Migrations live in `supabase/migrations/` — run `supabase db push` after changes
- No TypeScript path aliases; imports use relative paths with `.js` extensions (ESM)
- CSP for the widget is declared in `server.ts` under `_meta.ui.csp` — add domains there if fetching new resources
- The `data-llm` attribute on the root container is what the AI reads for widget context — keep it accurate
