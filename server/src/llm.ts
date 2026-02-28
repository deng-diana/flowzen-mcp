import Anthropic from "@anthropic-ai/sdk";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { env } from "./env.js";
import type { UserInsights } from "./user-insights.js";

const SYSTEM_PROMPT = `You are Flowzen's recommendation engine.
Your job is to choose the best next action using neuroscience + behavioral psychology while staying practical, kind, and precise.

Operating principles:
- Compassion first: never shame, guilt, or pressure the user.
- Scientific honesty: use high-level mechanisms (energy, cognitive load, friction, momentum, recovery). No diagnosis or fake certainty.
- Fidelity: use only provided tasks/context. Never invent task IDs, titles, due dates, or history.
- Actionability: one clear recommendation plus concrete steps that can be done right now.

Decision policy (hard rules):
1) Return exactly one of:
   - a task ID from Allowed task IDs, or
   - null if a short recovery reset is clearly better right now.
2) Mood gating:
   - great: choose high priority first. If no high exists, choose the hardest medium task.
   - okay: if any medium-priority task exists, choose medium priority first. Choose high only if no medium exists.
   - tired: if any low-priority or easy task exists, choose from those only. If all options are hard/high, null is preferred.
3) Never choose excluded IDs.
4) Tie-breakers: nearer due date, lower start friction, user pattern fit.

Output policy:
- Return strict JSON only (no markdown, no prose outside JSON).
- Use this exact schema:
  {
    "recommended_task_id": "task-id-or-null",
    "reason": "2-3 short sentences, <= 80 words",
    "reward": "one specific wellbeing nudge, <= 18 words, exactly one emoji",
    "reward_emoji": "same emoji as in reward",
    "focus_tips": ["tip1", "tip2"]
  }
- reason should naturally include at least 3 mechanism terms from: energy, cognitive load, attention, friction, momentum, recovery, fatigue.
- Include at least one supportive phrase such as "you can" or "one small step".
- focus_tips must be exactly 2 items, each <= 12 words, imperative verb first, immediately executable.
- Prefer action verbs: set, start, write, close, open, disable, block, mute, walk, breathe, drink, schedule.
- Avoid generic lines like "stay focused" or "do your best".`;

interface TaskContext {
  id: string;
  title: string;
  priority: string;
  difficulty: string;
  dueDate: string | null;
}

export interface LLMContext {
  currentTime: string;
  timeWindow: string;
  cognitiveState: string;
  mood: string;
  tasks: TaskContext[];
  userInsights?: UserInsights;
  excludedTaskIds?: string[];
}

export interface LLMRecommendation {
  recommendedTaskId: string | null;
  reason: string;
  reward: string;
  rewardEmoji: string;
  focusTips: string[];
}

export type RecommenderMode = "auto" | "rules" | "sampling" | "server_llm";

const RECOMMENDER_MODES: ReadonlySet<string> = new Set([
  "auto",
  "rules",
  "sampling",
  "server_llm",
]);

const MAX_TOKENS = 260;

export function getRecommenderMode(): RecommenderMode {
  const mode = env.FLOWZEN_RECOMMENDER_MODE ?? "auto";
  if (RECOMMENDER_MODES.has(mode)) {
    return mode as RecommenderMode;
  }
  return "auto";
}

export function isServerLlmEnabled(): boolean {
  return env.FLOWZEN_ENABLE_SERVER_LLM === "true" && Boolean(env.ANTHROPIC_API_KEY);
}

export function clientSupportsSampling(protocolServer: Server): boolean {
  return Boolean(protocolServer.getClientCapabilities()?.sampling);
}

export async function callClientSamplingForRecommendation(
  protocolServer: Server,
  context: LLMContext,
): Promise<LLMRecommendation | null> {
  if (!clientSupportsSampling(protocolServer)) {
    return null;
  }

  try {
    const response = await protocolServer.createMessage({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: buildUserPrompt(context),
          },
        },
      ],
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: MAX_TOKENS,
      modelPreferences: {
        costPriority: 0.9,
        speedPriority: 0.8,
        intelligencePriority: 0.65,
      },
    });

    return parseClaudeRecommendation(extractTextFromSamplingContent(response.content));
  } catch {
    return null;
  }
}

export async function callClaudeForRecommendation(context: LLMContext): Promise<LLMRecommendation | null> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(context) }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    return parseClaudeRecommendation(text);
  } catch {
    return null;
  }
}

function buildUserPrompt(context: LLMContext): string {
  const insightLines: string[] = [];
  if (context.userInsights && context.userInsights.completionCount > 0) {
    insightLines.push(`- User history: completed ${context.userInsights.completionCount} tasks`);
    if (context.userInsights.bestTimeWindows.length > 0) {
      insightLines.push(`- Most focused during: ${context.userInsights.bestTimeWindows.join(", ")}`);
    }
    if (context.userInsights.recentCompletions.length > 0) {
      insightLines.push(`- Recent wins: ${context.userInsights.recentCompletions.join(", ")}`);
    }
  }

  const excludeNote = context.excludedTaskIds && context.excludedTaskIds.length > 0
    ? `\n- Excluded task IDs: ${context.excludedTaskIds.join(", ")}`
    : "";
  const allowedTaskIds = context.tasks.map((t) => t.id).join(", ");

  return `Given:
- Time: ${context.currentTime} (${context.timeWindow}, ${context.cognitiveState})
- Mood: ${context.mood}
- Allowed task IDs: ${allowedTaskIds || "none"}
- Tasks: ${JSON.stringify(context.tasks, null, 2)}${insightLines.length > 0 ? "\n" + insightLines.join("\n") : ""}${excludeNote}

Task selection constraints:
1. Choose ONE recommended_task_id from Allowed task IDs, or null only if a short recovery reset is clearly better right now.
2. Respect excluded IDs strictly.${context.excludedTaskIds?.length ? " You have excluded IDs in this request." : ""}
3. Mood-first policy:
   - great -> choose high priority first. If no high exists, choose hardest medium.
   - okay -> if any medium-priority task exists, you MUST choose medium priority first.
   - tired -> if any low-priority or easy task exists, you MUST choose from those.
4. If all available tasks are hard/high and user is tired, prefer null + recovery suggestion.
5. Tie-breakers: nearer due date, lower initiation friction, user history patterns.

Writing constraints:
6. reason: 2-3 short sentences, <= 80 words, warm + evidence-based, include at least 3 mechanism terms from: energy/cognitive load/attention/friction/momentum/recovery/fatigue.
7. Include one supportive phrase such as "you can" or "one small step".
8. reward: <= 18 words, specific wellbeing action, include exactly one emoji.
9. focus_tips: exactly 2 items, each <= 12 words, start with one of: set/start/write/close/open/disable/block/mute/walk/breathe/drink/schedule.
10. No guilt language. No vague advice.

Respond in strict JSON only (no markdown, no commentary):
{
  "recommended_task_id": "uuid or null",
  "reason": "...",
  "reward": "...",
  "reward_emoji": "🎵",
  "focus_tips": ["tip1", "tip2"]
}`;
}


function extractTextFromSamplingContent(content: unknown): string {
  const blocks = Array.isArray(content) ? content : [content];
  const texts: string[] = [];

  for (const block of blocks) {
    if (typeof block !== "object" || block === null) {
      continue;
    }
    const item = block as { type?: unknown; text?: unknown };
    if (item.type === "text" && typeof item.text === "string") {
      texts.push(item.text);
    }
  }

  return texts.join("\n");
}

function parseClaudeRecommendation(text: string): LLMRecommendation | null {
  try {
    // Strip markdown code blocks if present
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      recommended_task_id?: unknown;
      reason?: unknown;
      reward?: unknown;
      reward_emoji?: unknown;
      focus_tips?: unknown;
    };

    const recommendedTaskIdRaw = parsed.recommended_task_id;
    if (
      recommendedTaskIdRaw !== null
      && recommendedTaskIdRaw !== undefined
      && typeof recommendedTaskIdRaw !== "string"
    ) {
      return null;
    }

    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
    const reward = typeof parsed.reward === "string" ? parsed.reward.trim() : "";
    if (!reason || !reward) {
      return null;
    }

    const rewardEmoji = typeof parsed.reward_emoji === "string" && parsed.reward_emoji.trim()
      ? parsed.reward_emoji.trim()
      : "✨";

    const focusTips = Array.isArray(parsed.focus_tips)
      ? parsed.focus_tips
          .filter((tip): tip is string => typeof tip === "string")
          .map((tip) => tip.trim())
          .filter(Boolean)
          .slice(0, 2)
      : [];

    return {
      recommendedTaskId: (recommendedTaskIdRaw as string | null | undefined) ?? null,
      reason,
      reward,
      rewardEmoji,
      focusTips,
    };
  } catch {
    return null;
  }
}
