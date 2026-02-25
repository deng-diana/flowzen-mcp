import { McpServer } from "skybridge/server";
import { z } from "zod";
import { env } from "./env.js";
import { executeActions, supabase } from "./supabase.js";
import { callClaudeForRecommendation } from "./llm.js";
import { fetchUserInsights, logRecommendation, recordCompletion } from "./user-insights.js";

const SERVER_URL = process.env.MCP_SERVER_URL ?? "http://localhost:3000";

async function fetchTasksWithDifficulty(userId: string) {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, completed, priority, difficulty, due_date, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const tasks: Task[] = (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    completed: t.completed,
    priority: t.priority ?? "medium",
    difficulty: t.difficulty ?? "medium",
    dueDate: t.due_date,
    createdAt: t.created_at,
  }));
  return { tasks, error };
}

type Mood = "great" | "okay" | "tired";

type TimeWindow =
  | "early_morning"
  | "peak_morning"
  | "post_lunch"
  | "afternoon_trough"
  | "second_peak"
  | "wind_down"
  | "rest_mode";

interface TimeContext {
  window: TimeWindow;
  label: string;
  cognitiveState: string;
}

function getTimeContext(hour: number): TimeContext {
  if (hour >= 6 && hour < 10) {
    return { window: "early_morning", label: "Morning Focus", cognitiveState: "rising energy" };
  } else if (hour >= 10 && hour < 12) {
    return { window: "peak_morning", label: "Peak Window", cognitiveState: "peak cognitive" };
  } else if (hour >= 12 && hour < 14) {
    return { window: "post_lunch", label: "Post-Lunch", cognitiveState: "post-lunch dip beginning" };
  } else if (hour >= 14 && hour < 15) {
    return { window: "afternoon_trough", label: "Afternoon Trough", cognitiveState: "natural fatigue trough" };
  } else if (hour >= 15 && hour < 18) {
    return { window: "second_peak", label: "Creative Peak", cognitiveState: "second energy peak" };
  } else if (hour >= 18 && hour < 20) {
    return { window: "wind_down", label: "Wind Down", cognitiveState: "winding down" };
  } else {
    return { window: "rest_mode", label: "Rest Mode", cognitiveState: "rest mode" };
  }
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: string;
  difficulty: string;
  dueDate: string | null;
  createdAt: string;
}

function getRecommendation(tasks: Task[], mood: Mood, timeCtx: TimeContext, excludedTaskIds?: string[]): Task | null {
  const activeTasks = tasks.filter((t) => !t.completed && !excludedTaskIds?.includes(t.id));
  if (activeTasks.length === 0) return null;

  const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };

  // Secondary sort: prefer tasks matching target difficulty
  let targetDifficulty: "easy" | "medium" | "hard";
  if (mood === "tired") {
    targetDifficulty = "easy";
  } else if (mood === "great" && (timeCtx.window === "peak_morning" || timeCtx.window === "early_morning")) {
    targetDifficulty = "hard";
  } else {
    targetDifficulty = "medium";
  }
  const difficultyMatchScore = (d: string): number => {
    if (d === targetDifficulty) return 2;
    if (d === "medium") return 1;
    return 0;
  };

  // Determine which priority tier to target based on mood × time
  // Full 9-cell matrix: mood (great/okay/tired) × time (morning/afternoon/evening)
  let targetPriority: "high" | "medium" | "low";

  if (mood === "tired") {
    // Tired always → easy, quick task regardless of time
    targetPriority = "low";
  } else if (timeCtx.window === "rest_mode") {
    // Past 8pm → protect rest regardless of mood
    targetPriority = "low";
  } else if (mood === "great" && (timeCtx.window === "peak_morning" || timeCtx.window === "early_morning")) {
    // Morning + Great → tackle hardest task
    targetPriority = "high";
  } else if (mood === "great" && timeCtx.window === "second_peak") {
    // Creative peak + Great → medium complexity creative work
    targetPriority = "medium";
  } else if (mood === "great" && timeCtx.window === "wind_down") {
    // Evening + Great → creative reflection, planning
    targetPriority = "medium";
  } else if (mood === "great" && (timeCtx.window === "post_lunch" || timeCtx.window === "afternoon_trough")) {
    // Slump + Great → step down to medium, don't waste peak tasks here
    targetPriority = "medium";
  } else if (mood === "okay" && (timeCtx.window === "early_morning" || timeCtx.window === "peak_morning")) {
    // Morning + Okay → medium priority task
    targetPriority = "medium";
  } else if (mood === "okay" && (timeCtx.window === "post_lunch" || timeCtx.window === "afternoon_trough")) {
    // Slump + Okay → admin/light tasks
    targetPriority = "low";
  } else if (mood === "okay" && (timeCtx.window === "second_peak")) {
    // Creative peak + Okay → medium work
    targetPriority = "medium";
  } else if (mood === "okay" && timeCtx.window === "wind_down") {
    // Evening + Okay → easy wins, wrap up
    targetPriority = "low";
  } else if (timeCtx.window === "afternoon_trough") {
    // Natural fatigue trough fallback
    targetPriority = "low";
  } else {
    targetPriority = "medium";
  }

  // Find task matching target priority, then fall back
  const priorities: Array<"high" | "medium" | "low"> =
    targetPriority === "high"
      ? ["high", "medium", "low"]
      : targetPriority === "medium"
      ? ["medium", "high", "low"]
      : ["low", "medium", "high"];

  for (const p of priorities) {
    const match = activeTasks
      .filter((t) => t.priority === p)
      .sort((a, b) => {
        // Primary: prefer tasks with nearer due dates
        if (a.dueDate && b.dueDate) {
          const dateDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          if (dateDiff !== 0) return dateDiff;
        }
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        // Secondary: prefer difficulty matching target
        const diffDiff = difficultyMatchScore(b.difficulty) - difficultyMatchScore(a.difficulty);
        if (diffDiff !== 0) return diffDiff;
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      })[0];
    if (match) return match;
  }

  return activeTasks[0];
}

function getReason(mood: Mood, timeCtx: TimeContext, task: Task | null): string {
  const hour = new Date().getHours();
  const timeStr = `${hour}:${String(new Date().getMinutes()).padStart(2, "0")}`;

  if (!task) {
    return "All tasks complete! Your brain deserves a proper rest. Cognitive recovery is not optional — it's how peak performance is sustained.";
  }

  if (mood === "tired") {
    return `You're tired — your prefrontal cortex is fatigued. Forcing deep work now reduces quality. This quick win (${task.priority} priority) builds momentum without draining you further.`;
  }

  if (timeCtx.window === "peak_morning") {
    return `It's ${timeStr} — your cortisol is peaking. This is your brain's optimal focus window. Use it on your most demanding tasks now while cognitive capacity is at its highest.`;
  }

  if (timeCtx.window === "early_morning") {
    return `It's ${timeStr} — your energy is rising. Your prefrontal cortex is warming up. This is ideal for structured, important work before distractions accumulate.`;
  }

  if (timeCtx.window === "afternoon_trough") {
    return `It's ${timeStr} — the post-lunch cortisol dip is normal physiology, not laziness. Your brain genuinely works better on structured, low-creativity tasks right now.`;
  }

  if (timeCtx.window === "post_lunch") {
    return `It's ${timeStr} — digestion is drawing blood flow from the brain. Admin, emails, and routine tasks match your current cognitive state perfectly.`;
  }

  if (timeCtx.window === "second_peak") {
    return `It's ${timeStr} — your second energy peak is here. Dopamine and serotonin levels support creative and collaborative thinking. Great time for this task.`;
  }

  if (timeCtx.window === "wind_down") {
    return `It's ${timeStr} — melatonin is rising. Your brain is consolidating memories from today. Light planning suits this state — keep it easy, finish strong.`;
  }

  if (timeCtx.window === "rest_mode") {
    return `It's ${timeStr} — your brain needs genuine rest for memory consolidation and emotional regulation. If you must work, keep it very light.`;
  }

  return `Based on your current energy (${mood}) and the time (${timeStr}), this is the most appropriate task for your brain right now.`;
}

const REWARDS = [
  { emoji: "🎵", text: "You've earned this — put on your favourite album, close your eyes, and let the music take over for 15 minutes. No phone, no notifications. Just you and the music you love." },
  { emoji: "🚶", text: "Step outside and walk — no destination needed. Even 10 minutes of fresh air helps your brain breathe, your shoulders drop, and your thinking get clearer. You deserve the break." },
  { emoji: "🎮", text: "Time to play — genuinely, guilt-free. Jump into a game you love for 20 minutes. Your brain has earned the fun, and fun is what keeps you going long-term." },
  { emoji: "🍵", text: "Make yourself a warm drink and just... be. 10 minutes of doing nothing is not laziness — it's how great minds recharge. Sit with it. You've worked hard today." },
  { emoji: "📞", text: "Think of someone who makes you smile. Call or text them right now — not to talk about work, just to connect. That's the real stuff that fills your cup back up." },
  { emoji: "🎬", text: "Pick an episode of something you've been meaning to watch, curl up, and enjoy it without guilt. Your focused self will thank your rested self tomorrow." },
  { emoji: "🧘", text: "Take 5 slow breaths: in for 4 counts, out for 6. Feel your shoulders soften. You carried something important today — let your body know it's okay to relax now." },
];

function getReward(mood: Mood, timeCtx: TimeContext): { emoji: string; text: string } {
  if (mood === "tired") {
    return REWARDS[3]; // 🍵 Tea and rest — always for tired state
  }
  if (timeCtx.window === "rest_mode" || timeCtx.window === "wind_down") {
    return REWARDS[5]; // 🎬 Watch an episode — evening winding down
  }
  if (timeCtx.window === "second_peak") {
    return REWARDS[6]; // 🧘 Breathing — reset after creative peak
  }
  if (mood === "great" && (timeCtx.window === "peak_morning" || timeCtx.window === "early_morning")) {
    return REWARDS[1]; // 🚶 Walk — physical recovery after intense focus
  }
  // General: rotate among social/music/gaming
  const fallbackPool = [REWARDS[0], REWARDS[2], REWARDS[4]];
  return fallbackPool[new Date().getMinutes() % fallbackPool.length];
}

const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add"),
    title: z.string().describe("Task title"),
    priority: z.enum(["low", "medium", "high"]).optional().describe("Task priority (default: medium)"),
    difficulty: z.enum(["easy", "medium", "hard"]).optional().describe("Task difficulty (default: medium). Use 'easy' for simple/routine tasks, 'hard' for complex/demanding tasks."),
    dueDate: z.string().optional().describe("Due date as ISO date string, e.g. 2025-03-01"),
  }),
  z.object({
    type: z.literal("delete"),
    taskId: z.string().describe("ID of the task to delete"),
  }),
  z.object({
    type: z.literal("toggle"),
    taskId: z.string().describe("ID of the task to mark complete or incomplete"),
  }),
  z.object({
    type: z.literal("rename"),
    taskId: z.string().describe("ID of the task to rename"),
    title: z.string().describe("New title for the task"),
  }),
  z.object({
    type: z.literal("update_priority"),
    taskId: z.string().describe("ID of the task to update"),
    priority: z.enum(["low", "medium", "high"]).describe("New priority level"),
  }),
  z.object({
    type: z.literal("update_difficulty"),
    taskId: z.string().describe("ID of the task to update"),
    difficulty: z.enum(["easy", "medium", "hard"]).describe("New difficulty level"),
  }),
]);

const server = new McpServer(
  { name: "flowzen", version: "1.0.0" },
  { capabilities: {} },
)
  .registerWidget(
  "flowzen",
  {
    description: "Flowzen — smart task prioritization based on your energy. Instantly recommends the single most important task to tackle right now, matched to your energy level and time of day. Call this tool whenever the user: mentions ANY tasks they need to do (extract them and add all at once); asks what to do next or where to start; feels overwhelmed or can't prioritise; states their energy or mood; wants to add, complete, rename, or delete tasks; or needs a recommendation. When a user describes their workload in natural language, extract every task and add them all in one call — never ask the user to re-enter tasks manually.",
    _meta: {
      ui: {
        csp: {
          resourceDomains: [
            "https://fonts.googleapis.com",
            "https://fonts.gstatic.com",
          ],
          connectDomains: [env.SUPABASE_URL],
        },
      },
    },
  },
  {
    description:
      "Display the Flowzen task board with an AI-powered recommendation. " +
      "Call this when the user: asks 'what should I do?' or 'where do I start?'; feels overwhelmed; mentions tasks they need to do; wants to add, complete, rename, or delete tasks; states their energy or mood. " +
      "\n\nTASK EXTRACTION — VERY IMPORTANT: When the user mentions tasks in natural language (e.g. 'I have a demo to finish, emails to reply, a proposal to review'), you MUST extract every task and add them ALL in a SINGLE tool call using the `actions` array with multiple { type: 'add' } entries. Do NOT ask the user to repeat themselves or manually enter tasks. Extract task titles and infer priority from their language: 'urgent / critical / important / must / deadline / investor / demo' → 'high'; 'quick / minor / low / whenever / small' → 'low'; anything else → 'medium'. If the user explicitly states priority (e.g. 'high priority'), use that. " +
      "\n\nPASS MOOD: if the user stated how they feel (overwhelmed, tired, energised, on fire), map it to 'tired' / 'okay' / 'great' and pass it as `mood`. Otherwise omit mood and let the widget handle it. " +
      "\n\nCRITICAL RESPONSE FORMAT: After calling this tool, output ZERO text. Do not say anything. Do not write a single word. Do not list the tasks. Do not say 'I added X tasks'. Do not explain the recommendation. The widget displays everything — task list, recommendation, reasoning, tips, reward. Any text you write clutters the UI. STAY COMPLETELY SILENT after this tool call.",
    inputSchema: {
      actions: z
        .array(ActionSchema)
        .optional()
        .describe("Actions to perform before returning the task list"),
      mood: z
        .enum(["great", "okay", "tired"])
        .optional()
        .describe("Your current emotional/energy state — affects which task is recommended"),
      excludedTaskIds: z
        .array(z.string())
        .optional()
        .describe("Task IDs to exclude from recommendation — used for 'try another' feature"),
      currentRecommendedId: z
        .string()
        .optional()
        .describe("Task ID that was currently recommended — used to track wasRecommended on completion"),
      acceptRecommendationId: z
        .string()
        .optional()
        .describe("Task ID the user explicitly accepted ('Start this task') — marks was_accepted in recommendation_log"),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  async ({ actions, mood, excludedTaskIds, currentRecommendedId, acceptRecommendationId }, extra) => {
    const userId = ((extra.authInfo?.extra as any)?.userId as string | undefined)
      ?? "dev-user-demo";

    if (!userId) {
      return {
        content: [
          { type: "text", text: "Please sign in to use Flowzen." },
        ],
        isError: true,
        _meta: {
          "mcp/www_authenticate": [
            `Bearer resource_metadata="${SERVER_URL}/.well-known/oauth-protected-resource/mcp"`,
          ],
        },
      };
    }

    if (actions && actions.length > 0) {
      // add, rename, update_priority, update_difficulty handled directly (supabase.ts doesn't support them fully)
      // toggle + delete go through executeActions
      const addActions = actions.filter((a) => a.type === "add");
      const renameActions = actions.filter((a) => a.type === "rename");
      const priorityActions = actions.filter((a) => a.type === "update_priority");
      const difficultyActions = actions.filter((a) => a.type === "update_difficulty");
      const toggleDeleteActions = actions.filter((a) => a.type === "toggle" || a.type === "delete");

      await Promise.all([
        toggleDeleteActions.length > 0 ? executeActions(userId, toggleDeleteActions as any) : Promise.resolve(),
        ...addActions.map((a) =>
          a.type === "add"
            ? supabase.from("tasks").insert({
                user_id: userId,
                title: a.title,
                priority: a.priority ?? "medium",
                difficulty: (a as any).difficulty ?? "medium",
                due_date: (a as any).dueDate ?? null,
              })
            : Promise.resolve()
        ),
        ...renameActions.map((a) =>
          a.type === "rename" && a.taskId && a.title
            ? supabase.from("tasks").update({ title: a.title }).eq("id", a.taskId).eq("user_id", userId)
            : Promise.resolve()
        ),
        ...priorityActions.map((a) =>
          a.type === "update_priority" && a.taskId
            ? supabase.from("tasks").update({ priority: a.priority }).eq("id", a.taskId).eq("user_id", userId)
            : Promise.resolve()
        ),
        ...difficultyActions.map((a) =>
          a.type === "update_difficulty" && a.taskId
            ? supabase.from("tasks").update({ difficulty: a.difficulty }).eq("id", a.taskId).eq("user_id", userId)
            : Promise.resolve()
        ),
      ]);
    }

    const [tasksResult, userInsights] = await Promise.all([
      fetchTasksWithDifficulty(userId),
      fetchUserInsights(userId),
    ]);
    let { tasks, error } = tasksResult;

    // Record completions for toggled tasks (fire-and-forget)
    if (actions) {
      const hour0 = new Date().getHours();
      const timeCtx0 = getTimeContext(hour0);
      for (const action of actions) {
        if (action.type === "toggle" && action.taskId) {
          const toggled = tasks.find((t) => t.id === action.taskId);
          if (toggled && (toggled as Task).completed) {
            recordCompletion({
              userId,
              taskId: action.taskId,
              mood: mood ?? "okay",
              timeWindow: timeCtx0.window,
              wasRecommended: action.taskId === currentRecommendedId,
            });
          }
        }
      }
    }

    // Mark recommendation as accepted when user starts the recommended task
    if (acceptRecommendationId) {
      supabase
        .from("recommendation_log")
        .update({ was_accepted: true, accepted_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("recommended_task_id", acceptRecommendationId)
        .is("was_accepted", null)
        .order("recommended_at", { ascending: false })
        .limit(1)
        .then(() => {/* fire-and-forget */});
    }

    // Seed default tasks for new users so the recommendation engine has data to work with
    if (!error && tasks.length === 0) {
      const seedTasks = [
        { title: "Finish product demo for Friday's investor call", priority: "high" as const, difficulty: "hard" as const },
        { title: "Write performance review for the team", priority: "high" as const, difficulty: "hard" as const },
        { title: "Review Q2 marketing budget proposal", priority: "medium" as const, difficulty: "medium" as const },
        { title: "Reply to client feedback emails", priority: "medium" as const, difficulty: "easy" as const },
        { title: "Brainstorm ideas for the team offsite", priority: "medium" as const, difficulty: "medium" as const },
        { title: "Update project wiki with new feature notes", priority: "low" as const, difficulty: "easy" as const },
        { title: "Read one chapter of your current book", priority: "low" as const, difficulty: "easy" as const },
      ];
      await Promise.all(seedTasks.map((t) =>
        supabase.from("tasks").insert({ user_id: userId, ...t })
      ));
      const seeded = await fetchTasksWithDifficulty(userId);
      if (!seeded.error) {
        tasks = seeded.tasks;
        error = seeded.error;
      }
    }

    if (error) {
      return {
        content: [
          { type: "text", text: `Error fetching tasks: ${error.message}` },
        ],
        isError: true,
      };
    }

    const hour = new Date().getHours();
    const timeCtx = getTimeContext(hour);
    const effectiveMood: Mood = mood ?? "okay";

    let recommendation = getRecommendation(tasks as Task[], effectiveMood, timeCtx, excludedTaskIds);
    let reason = getReason(effectiveMood, timeCtx, recommendation);
    let reward = getReward(effectiveMood, timeCtx);
    let focusTips: string[] = [];

    if (env.ANTHROPIC_API_KEY) {
      const now = new Date();
      const llmResult = await callClaudeForRecommendation({
        currentTime: `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`,
        timeWindow: timeCtx.label,
        cognitiveState: timeCtx.cognitiveState,
        mood: effectiveMood,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: (t as Task).title,
          priority: (t as Task).priority,
          difficulty: (t as Task).difficulty,
          dueDate: (t as Task).dueDate,
        })),
        userInsights,
        excludedTaskIds,
      });
      if (llmResult) {
        recommendation = llmResult.recommendedTaskId
          ? (tasks.find((t) => t.id === llmResult.recommendedTaskId) as Task ?? null)
          : null;
        reason = llmResult.reason;
        reward = { emoji: llmResult.rewardEmoji, text: llmResult.reward };
        focusTips = llmResult.focusTips;
      }
    }

    // Log recommendation (fire-and-forget)
    logRecommendation({
      userId,
      recommendedTaskId: recommendation?.id ?? null,
      mood: effectiveMood,
      timeWindow: timeCtx.window,
      reasonText: reason,
    });

    const active = tasks.filter((t) => !t.completed).length;

    return {
      structuredContent: {
        tasks,
        recommendation,
        reason,
        reward,
        focusTips,
        timeContext: timeCtx.label,
      },
      content: [
        {
          type: "text",
          text: active === 0
            ? `✓ Flowzen widget is open. All tasks complete! Do not add any text.`
            : `✓ Flowzen widget is open. Do not add any text — the widget shows everything.`,
        },
      ],
    };
  },
);

export default server;
export type AppType = typeof server;
