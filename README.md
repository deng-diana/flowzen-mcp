# Flowzen

**Work with your brain. Not against it.**

Flowzen is an MCP app inside Claude. It knows your tasks, the time, and how you're feeling — and gives you one clear answer: *do this, right now. With the science behind why.*

> *Todoist gives you a list. Flowzen gives you an answer.*

**Try it now in Claude:** add `https://flowzen-mcp-dfdb5406.alpic.live/mcp` as a remote MCP server in your Claude settings. Requires a Pro, Team, Max, or Enterprise account.

---

## The Problem

Every day you open your task list, stare at it, and close it.

That's not procrastination. That's decision fatigue — and it's the reason your most important work stays undone.

Your brain has energy rhythms: peaks, troughs, recovery windows. Every other productivity tool ignores this. They hand you a list and leave you to figure out the rest.

Flowzen closes that gap.

---

## What Flowzen Does

Tell Flowzen what you need to do and how you're feeling. It gives you **one answer** — not a sorted list, not a priority matrix — one task to do right now, with a reason rooted in neuroscience.

- **10am, energised?** → *Your cortisol is peaking. This is your sharpest window. Use it on your hardest task.*
- **2pm, crashing?** → *This is biology, not weakness. Light tasks only — your second peak hits around 3pm.*
- **Just finished something?** → *You've earned recovery. This is how sustained performance actually works.*

---

## Features

- **Smart task recommendation** — one task, matched to your energy state and time of day
- **Neuroscience reasoning** — warm, human rationale grounded in circadian rhythm research
- **Full task management** — add, complete, delete tasks via chat or widget
- **Energy state selector** — four states with time-aware defaults
- **Recovery nudges** — rest suggestions after completion
- **Conversational capture** — mention tasks naturally in Claude chat; Flowzen captures them

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Skybridge](https://docs.skybridge.tech) MCP app |
| Backend | Node.js / TypeScript |
| Frontend | React widget |
| Database | Supabase (Postgres + RLS) |
| Auth | Public mode on Alpic (no OAuth) or protected mode via Alpic gateway |
| Hosting | Alpic |

---

## Local Development

### Prerequisites

- Node.js v24.13+
- pnpm — `npm install -g pnpm`
- Supabase CLI — `brew install supabase/tap/supabase`
- Supabase project at [supabase.com/dashboard](https://supabase.com/dashboard)

### Setup

**1. Install dependencies**

```bash
pnpm i
```

**2. Configure environment variables**

```bash
cp .env.example .env
```

Fill in your keys:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# Optional
# ANTHROPIC_API_KEY=...
# MCP_SERVER_URL=https://your-public-base-url
```

**3. Link Supabase and push migrations**

```bash
supabase link
supabase db push
```

**4. Start the dev server**

```bash
pnpm dev
```

Skybridge devtools available at `http://localhost:3000`.

**5. Connect to Claude (optional)**

```bash
cloudflared tunnel --url http://localhost:3000
```

Add `https://<tunnel>.trycloudflare.com/mcp` as a remote MCP server in Claude settings.

---

## Project Structure

```
server/src/
  index.ts        ← Express app setup (do not modify)
  middleware.ts   ← MCP transport wiring (do not modify)
  supabase.ts     ← DB operations (do not modify)
  server.ts       ← MCP tool, recommendation engine, neuroscience logic

web/src/
  widgets/
    flowzen.tsx   ← Main widget UI
  index.css       ← All styles (no Tailwind, no CSS modules)
  helpers.ts      ← Skybridge hooks
  components/     ← Types, AddTaskForm, LoadingScreen

supabase/
  migrations/     ← Database schema migrations
```

---

## Database Schema

`tasks` table:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key |
| `user_id` | text | Logical user ID |
| `title` | text | Task name |
| `priority` | text | `"low"` \| `"medium"` \| `"high"` |
| `difficulty` | text | `"easy"` \| `"medium"` \| `"hard"` |
| `completed` | bool | Completion flag |
| `due_date` | date | Optional |
| `created_at` | timestamptz | Auto-set |

RLS is enabled. All queries use the service role key filtered by `user_id`.

---

## Supabase Commands

```bash
supabase link                    # Link to remote project (once)
supabase db push                 # Apply migrations to remote DB
supabase db reset --linked       # Reset remote DB (destructive)
supabase migration new <name>    # Create a new migration
```

---

## Deploy to Production

```bash
git add <files>
git commit -m "your message"
git push origin main
```

In this repo, pushing to `main` triggers Alpic auto-deploy. Then use your deployed URL with `/mcp` appended as a remote MCP server in Claude settings.

After deploy, run:

```bash
BASE_URL=https://flowzen-mcp-dfdb5406.alpic.live pnpm probe:prod
```

This checks initialize on `/` and `/mcp`, and prints OAuth endpoint statuses.

---

## OAuth on Alpic (Important)

On **public** Alpic deployments, OAuth discovery and authorization routes often return `404` from the public edge. This is expected.

- Public mode focus: reachable MCP endpoint (`/` or `/mcp`)
- Protected mode focus: configure auth provider in Alpic; OAuth routes are handled by Alpic gateway

So if MCP initialize works but OAuth routes are `404`, your app can still be healthy in public mode.

---

## Roadmap

- Google Calendar sync — block time automatically around recommendations
- Apple Health energy data — replace manual mood input with biometric signal
- Voice check-in — "I'm feeling great, what should I tackle?" via speech
- Team mode — coordinate focus windows across a shared task list

---

## Philosophy

Most productivity tools are designed for machines. Constant output. No friction. No humanity.

Flowzen is designed for humans.

The goal isn't to do more. **It's to feel good about what you did.**

---

## Resources

- [Skybridge Documentation](https://docs.skybridge.tech/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Alpic Documentation](https://docs.alpic.ai/)
