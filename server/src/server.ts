import { McpServer } from "skybridge/server";
import { z } from "zod";
import { env } from "./env.js";
import { executeActions, fetchTasks } from "./supabase.js";
import { callClaudeForRecommendation } from "./llm.js";
import { fetchUserInsights, logRecommendation, recordCompletion } from "./user-insights.js";

const SERVER_URL = process.env.MCP_SERVER_URL ?? "http://localhost:3000";

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
  dueDate: string | null;
  createdAt: string;
}

function getRecommendation(tasks: Task[], mood: Mood, timeCtx: TimeContext, excludedTaskIds?: string[]): Task | null {
  const activeTasks = tasks.filter((t) => !t.completed && !excludedTaskIds?.includes(t.id));
  if (activeTasks.length === 0) return null;

  const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };

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
        // Prefer tasks with due dates closer
        if (a.dueDate && b.dueDate)
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
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
  { emoji: "🎵", text: "Put on an album you love and do nothing else for 15 minutes. Music activates your brain's reward circuits — this is recovery, not procrastination." },
  { emoji: "🚶", text: "Take a 10-minute walk outside. Physical movement clears cortisol and increases BDNF — the molecule that helps your brain learn and grow." },
  { emoji: "🎮", text: "Guilt-free gaming for 20 minutes. Play activates dopamine without the pressure of productivity — your nervous system needs this." },
  { emoji: "🍵", text: "Make a cup of tea and do nothing for 10 minutes. Deliberate rest is cognitively restorative. Your brain works during rest — let it." },
  { emoji: "📞", text: "Call a friend or family member. Social connection releases oxytocin and reduces cortisol — it literally makes you healthier and more focused." },
  { emoji: "🎬", text: "Watch one episode of something you enjoy. Narrative engagement gives your task-focused brain a structured rest without the guilt." },
  { emoji: "🧘", text: "5 minutes of slow breathing (4 in, 6 out). This activates your parasympathetic nervous system and resets your stress response." },
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

const ActionSchema = z.object({
  type: z.enum(["add", "delete", "toggle"]),
  title: z.string().optional().describe("Task title (required for add)"),
  priority: z
    .enum(["low", "medium", "high"])
    .optional()
    .describe("Task priority"),
  dueDate: z.string().optional().describe("Due date (ISO string)"),
  taskId: z.string().optional().describe("Task ID (required for delete/toggle)"),
});

const server = new McpServer(
  { name: "flowzen", version: "1.0.0" },
  { capabilities: {} },
).registerWidget(
  "flowzen",
  {
    description: "Flowzen — your intelligent compass for mindful productivity. Recommends the next best action based on your tasks, time of day, and emotional state.",
    _meta: {
      ui: {
        csp: {
          resourceDomains: ["https://fonts.googleapis.com"],
          connectDomains: [env.SUPABASE_URL],
        },
      },
    },
  },
  {
    description:
      "Call with no arguments to display your Flowzen task board with a personalised recommendation. Pass `mood` (great/okay/tired) to tailor the recommendation to your emotional state. Pass an `actions` array to add, toggle, or delete tasks.",
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
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  async ({ actions, mood, excludedTaskIds }, extra) => {
    const userId = ((extra.authInfo?.extra as any)?.userId as string | undefined)
      ?? (process.env.NODE_ENV !== "production" ? "dev-user" : undefined);

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
      await executeActions(userId, actions);
    }

    const [tasksResult, userInsights] = await Promise.all([
      fetchTasks(userId),
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
              wasRecommended: false,
            });
          }
        }
      }
    }

    // Seed default tasks for new users so the recommendation engine has data to work with
    if (!error && tasks.length === 0) {
      const seedTasks = [
        { type: "add" as const, title: "Finish product demo for Friday's investor call", priority: "high" as const },
        { type: "add" as const, title: "Write performance review for the team", priority: "high" as const },
        { type: "add" as const, title: "Review Q2 marketing budget proposal", priority: "medium" as const },
        { type: "add" as const, title: "Reply to client feedback emails", priority: "medium" as const },
        { type: "add" as const, title: "Brainstorm ideas for the team offsite", priority: "medium" as const },
        { type: "add" as const, title: "Update project wiki with new feature notes", priority: "low" as const },
        { type: "add" as const, title: "Read one chapter of your current book", priority: "low" as const },
      ];
      await executeActions(userId, seedTasks);
      const seeded = await fetchTasks(userId);
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
    const done = tasks.filter((t) => t.completed).length;

    const summaryText = recommendation
      ? `Flowzen recommends: "${recommendation.title}" (${recommendation.priority} priority). ${active} active, ${done} done. Time window: ${timeCtx.label}. Mood: ${effectiveMood}.`
      : `All tasks complete! ${done} done. Time window: ${timeCtx.label}. Mood: ${effectiveMood}.`;

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
          text: summaryText,
        },
      ],
    };
  },
);

export default server;
export type AppType = typeof server;
