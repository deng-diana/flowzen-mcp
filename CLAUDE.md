# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Before writing code, first explore the project structure, then invoke the `mcp-app-builder` skill for framework documentation.

---

## Commands

```bash
pnpm dev          # Start dev server at http://localhost:3000 (Skybridge devtools at root)
pnpm build        # Build for production
pnpm start        # Start production server
pnpm deploy       # Deploy via Alpic

# Supabase
supabase link                    # Link to remote project (once)
supabase db push                 # Apply migrations to remote DB
supabase db reset --linked       # Reset remote DB (destructive)
supabase migration new <name>    # Create a new migration file

# Tunnel for Claude testing
cloudflared tunnel --url http://localhost:3000
# Then add https://<tunnel>.trycloudflare.com/mcp in Claude settings
```

No test suite is configured. No linting scripts are defined in `package.json`.

---

## Architecture

This is a **Skybridge MCP app** — an MCP server that exposes tools and a React widget to AI assistants (Claude, ChatGPT). Two users consume the app simultaneously: the human interacts with the widget, the AI sees its state via structured content.

### Request Flow

```
AI Assistant → POST /mcp → Express → Clerk auth (prod only) → McpServer
  → executeActions() on Supabase → fetchTasks() → recommendation engine
  → returns { structuredContent: { tasks, recommendation, reason, reward, timeContext } }
                                                           ↓
                                               React widget reads & renders
```

### Server (`server/src/`)

| File | Role |
|------|------|
| `index.ts` | Express app setup, Clerk auth middleware, Skybridge devtools — **do not modify** |
| `middleware.ts` | Clerk MCP middleware wiring — **do not modify** |
| `env.ts` | Validated env vars via `@t3-oss/env-core` + zod |
| `supabase.ts` | All DB operations (`fetchTasks`, `executeActions`) — **do not modify** |
| `server.ts` | MCP tool definition, recommendation engine, neuroscience reasons, rewards |

The MCP tool is registered as widget `"manage-tasks"` on a `McpServer` from `skybridge/server`. In development, auth is skipped and `userId` defaults to `"dev-user"`. In production, Clerk JWT extracts `userId` from `authInfo.extra`.

### Frontend (`web/src/`)

| File | Role |
|------|------|
| `widgets/manage-tasks.tsx` | Main widget — all UI logic lives here |
| `index.css` | All styles (no CSS modules, no Tailwind) |
| `helpers.ts` | `useToolInfo`, `useCallTool` hooks from Skybridge |
| `components/types.ts` | `Task`, `Status` types and `getTaskStatus()` helper |
| `components/AddTaskForm.tsx` | Task creation form |
| `components/LoadingScreen.tsx` | Loading state component |

The widget uses Skybridge hooks:
- `useToolInfo<"manage-tasks">()` — reactive server output (`output`, `isPending`)
- `useCallTool("manage-tasks")` — call the MCP tool (`callToolAsync`)
- `useWidgetState<T>()` — persisted widget state (survives re-renders, visible to LLM)
- `useLayout()` — provides `theme` (`"dark"` | `"light"`)

Optimistic updates pattern: mutate `widgetState` immediately, then call `syncWithServer()` which calls `callToolAsync` and reconciles with the server response.

### Database Schema

`tasks` table:
- `id` (uuid), `user_id` (text), `title` (text), `completed` (bool)
- `priority` — `"low"` | `"medium"` | `"high"`
- `status` — `"todo"` | `"in_progress"` | `"done"`
- `due_date` (date, nullable), `created_at` (timestamptz)

RLS is enabled. All queries use the service role key and filter by `user_id`.

### Recommendation Engine (in `server.ts`)

Pure rule-based logic, no LLM calls:
1. `getTimeContext(hour)` → maps current hour to one of 7 time windows
2. `getRecommendation(tasks, mood, timeCtx)` → selects priority tier from mood×time matrix, then finds best matching task (prefers tasks with nearer due dates)
3. `getReason(mood, timeCtx, task)` → returns a neuroscience explanation string
4. `getReward(mood)` → selects a recovery activity (rotates by minute)

### Environment Variables

Required in `.env`:
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CLERK_SECRET_KEY
CLERK_PUBLISHABLE_KEY   # also accepts NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
```

### Key Constraints

- **Do not modify** `server/src/index.ts`, `server/src/middleware.ts`, `server/src/supabase.ts`
- Migrations live in `supabase/migrations/` — run `supabase db push` after changes
- No TypeScript path aliases; imports use relative paths with `.js` extensions (ESM)
- CSP for the widget is declared in `server.ts` under `_meta.ui.csp` — add domains there if fetching new resources
- The `data-llm` attribute on the root container is what the AI reads for widget context — keep it accurate
