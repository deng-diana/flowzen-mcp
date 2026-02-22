# Flowzen — SPEC.md

> *Your cognitive compass inside Claude. Not more tasks — the right task, right now.*

---

## Phase 1: Value Proposition

**Problem:**
Most people carry a mental spaghetti of tasks every day — too many things, unclear
priorities, no sense of where to start. For ADHD individuals and creative workers who
make decisions spontaneously, this mental clutter becomes cognitive overload.
The result: the day ends with important things undone, a quiet sense of guilt,
exhaustion, and a feeling that time was wasted — not because they were lazy,
but because no one helped them decide.

**User:**
- Primary: ADHD individuals and creative workers
- Secondary: Knowledge workers overwhelmed by competing priorities
- Common trait: They don't lack motivation — they lack a trusted signal for *what to do next*

**Pain today:**
Todo apps show everything at once. They don't know what time it is, how you feel,
or what your brain can actually handle right now. They optimise for capture, not action.

**Core action (single focus):**
→ **"Tell me what to do next"** — one recommendation, grounded in neuroscience,
matched to energy state and time of day.

Supporting actions:
- Manage task list (add / complete / delete)
- Input energy state to contextualise the recommendation

---

## Phase 2: Why LLM?

**Conversational win:**
A user can tell Claude "I have these tasks today: X, Y, Z" and Flowzen receives them
automatically — no manual entry required. Natural language becomes structured data.
Future: "I'm exhausted and my calendar is full after 3pm" becomes rich context
without a single form field.

**LLM adds:**
- Interprets task descriptions and infers cognitive load
- Reasons across energy state × time × priority × task type
- Generates warm, contextualised rationale (not generic tips)
- Produces recommendations grounded in psychology + neuroscience literature
  (Getting Things Done, Atomic Habits, Peak Performance, HBR research)
- Adapts tone based on user's current state (energetic vs. burnout)

**What LLM lacks (Flowzen provides):**
- Persisted task list (Supabase)
- Current time of day (server-side)
- User's energy state (widget selection)
- Task metadata: priority, due date, estimated effort

**Why inside Claude, not a standalone app?**
The recommendation *is* a conversation. The user is already talking to Claude about
their day. Flowzen intercepts that context — tasks mentioned in chat, frustration
expressed naturally, calendar data (roadmap) — and turns it into a signal.
A standalone app would require intentional switching. Flowzen meets the user
where the thinking already happens.

**Rule-based fallback:**
If LLM call fails or is unavailable, a circadian rhythm matrix
(time × energy → task type) serves as fallback. LLM is always primary.

---

## Phase 3: UI Overview

### First View — Task List

User sees their persisted task list immediately.
If empty: a gentle prompt to add their first task.

```
┌─────────────────────────────────────┐
│  🌊 Flowzen          Friday 10:42am │
├─────────────────────────────────────┤
│  YOUR TASKS                         │
│                                     │
│  ☐ Prepare pitch deck  🔴 HIGH  2pm │
│  ☐ Reply to investors  🟡 MED   EOD │
│  ☐ Review PRD          🟢 LOW       │
│  ✓ Book travel                      │
│                                     │
│  + Add task                         │
└─────────────────────────────────────┘
```

Add task form fields: **Title · Priority (High/Med/Low) · Due time (optional)**

---

### Energy State Selector

Below the task list. Default state is time-aware:

| Time of day | Default state |
|-------------|---------------|
| 6am – 12pm | ⚡ Energised |
| 12pm – 3pm | 😐 Okay |
| 3pm – 7pm | 😮‍💨 Tired |
| 7pm+ | 🪫 Burned out |

User can override. Four states (energy management framework):

- **⚡ Energised** — Peak cognitive capacity, ready for deep work
- **😐 Okay** — Functional but not sharp, moderate tasks
- **😮‍💨 Tired** — Cognitive reserves low, light tasks or a win to rebuild
- **🪫 Burned out** — System overload, rest is the task

```
┌─────────────────────────────────────┐
│  How's your energy right now?       │
│                                     │
│  ⚡ Energised  😐 Okay              │
│  😮‍💨 Tired     🪫 Burned out        │
│                                     │
│  ┌─────────────────────────────┐   │
│  │   Find my next best move →  │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**CTA button copy:** `Find my next best move →`
*(Active, ownership-giving, not commanding)*

---

### Recommendation View

LLM generates one focused recommendation. Displayed as a card:

```
┌─────────────────────────────────────┐
│  ⚡ YOUR NEXT MOVE                   │
│                                     │
│  Prepare pitch deck                 │
│  High priority · due 2pm            │
│                                     │
│  WHY NOW                            │
│  It's 10am — your prefrontal cortex │
│  is operating at peak. Cortisol is  │
│  naturally high, supporting focus   │
│  and decision-making. GTD principle:│
│  clear your highest-stakes item     │
│  while the mind is sharpest.        │
│                                     │
│  ALSO                               │
│  You've been at this a while —      │
│  drink some water. A 5-min walk     │
│  after this task will reset you.    │
│                                     │
│  [  ✓ This works for me  ]          │
│  [ ↻ Show me something else ]       │
└─────────────────────────────────────┘
```

**Two actions:**
- `✓ This works for me` — marks task as in-progress, returns to list
- `↻ Show me something else` — LLM generates alternative recommendation

**Wellbeing nudge:** Always present, always brief. One line.
Examples: *"Drink water."* / *"Open a window."* / *"Stand up for 2 minutes."*

---

### End State

User completes task → taps checkbox → small moment of acknowledgment:

```
  ✓ Done. That mattered.
```

Then widget refreshes — updated task list, ready for next recommendation.

---

## Phase 4: Product Context

- **Framework:** Skybridge (MCP app, Cloudflared tunnel)
- **Backend:** Node.js / TypeScript — `server/src/server.ts`
- **Frontend:** React widget — `web/src/widgets/manage-tasks.tsx`
- **Database:** Supabase — `tasks` table (title, priority, due_time, status, user_id)
- **Auth:** Clerk (Google OAuth, already integrated)
- **LLM:** Claude API via MCP tool — primary recommendation engine
- **Fallback:** Circadian rhythm rule matrix (time × energy → task type)
- **Task input:** Widget-first (manual add) + conversational capture from Claude chat
- **Future integrations (roadmap):** Google Calendar, Apple Health, Notion

---

## LLM Recommendation Prompt (reference)

```
You are Flowzen, a cognitive compass grounded in neuroscience and performance psychology.

Context:
- Current time: {time}
- User energy state: {energy_state}
- Tasks: {task_list_with_priority_and_due}

Your job:
1. Recommend ONE task from the list the user should do right now.
2. Explain WHY in 2-3 warm, human sentences — reference neuroscience or
   performance research (circadian rhythm, cortisol, prefrontal cortex,
   GTD, Atomic Habits, Peak Performance).
3. Add ONE brief wellbeing nudge (water, movement, air).
4. Keep total response under 80 words.
5. Never be prescriptive or cold. Sound like a thoughtful coach, not a system.

If energy state is "Burned out": recommend rest, not a task.
```

---

## Design Language

Warm, human, considered — aligned with Claude.ai's brand.

- Typography: clean, generous line-height, never cramped
- Recommendation card: soft amber (`#FFF8ED`) — energy, action
- Wellbeing nudge: cool teal (`#EDF8F6`) — rest, recovery
- Completed tasks: muted, not hidden — acknowledge the work done
- Tone: a thoughtful coach, never a productivity drill sergeant
- Micro-copy matters: "That mattered." / "Find my next best move →"

---

## Files to Modify

```
server/src/server.ts              ← LLM call, recommendation logic, task CRUD
web/src/widgets/manage-tasks.tsx  ← Full UI: task list, energy selector, recommendation card
web/src/index.css                 ← Flowzen design tokens
```

**Do not touch:**
```
server/src/index.ts
server/src/supabase.ts
server/src/middleware.ts
```

---

## MVP Checklist (Tonight)

- [ ] Task list: add / complete / delete with priority + due time
- [ ] Energy state selector with time-aware default
- [ ] LLM-powered recommendation (single task + rationale + wellbeing nudge)
- [ ] "Show me something else" alternative
- [ ] Conversational task capture from Claude chat
- [ ] Flowzen UI: warm, not a template

**Pitch as roadmap:**
Google Calendar sync · Apple Health energy data · Voice check-in · Team mode

---

## 60-Second Pitch

**Hook:**
*"How many times this week did you open your task list — and still couldn't decide
where to start? That feeling isn't weakness. It's cognitive overload.
And no todo app is designed to solve it."*

**Product:**
*"Flowzen is an MCP app inside Claude. It knows your tasks, the time,
and how you're feeling — and gives you one clear answer: do this, right now.
With the science behind why."*

**Demo:**
*"It's 10am, I'm feeling okay. Flowzen says: start with the pitch deck.
Because cortisol is naturally high right now — it's your sharpest window.
Not done yet? Here's an alternative. Finished? Go drink some water and take
a two-minute walk. That's not a tip. That's neuroscience."*

**Vision:**
*"Most tools treat you like a machine.
Flowzen treats you like a human.
The goal isn't to do more.
It's to end the day feeling like you did what mattered."*