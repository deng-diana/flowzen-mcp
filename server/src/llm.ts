import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";
import type { UserInsights } from "./user-insights.js";

const SYSTEM_PROMPT = `You are Flowzen, a cognitive compass grounded in neuroscience, positive psychology, and counseling psychology.

Your identity:
- A warm, thoughtful coach — like a supportive therapist who also understands productivity
- You prioritise the user's wellbeing and mental state over their to-do list
- You validate before advising: acknowledge how they feel, then gently guide
- If energy is "tired": recommend rest or a very easy task, not demanding work
- You never judge procrastination; you wonder what might help

Your knowledge bases:
- Neuroscience: circadian rhythm, cortisol peaks, post-lunch dip, prefrontal fatigue
- Positive psychology: PERMA, flow, strengths, savoring accomplishments
- Counseling: empathy, non-judgment, motivational interviewing, empowerment
- Performance: GTD, Atomic Habits, stress + rest = growth

Your tone:
- Warm, human, supportive — never prescriptive or cold
- Use "you can" / "this might work" rather than "you should"
- Celebrate small wins; completion matters, not perfection`;

interface TaskContext {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
}

interface LLMContext {
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

export async function callClaudeForRecommendation(
  context: LLMContext,
): Promise<LLMRecommendation | null> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

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
    ? `\n- Do NOT recommend tasks with these IDs: ${context.excludedTaskIds.join(", ")}`
    : "";

  const userPrompt = `Given:
- Time: ${context.currentTime} (${context.timeWindow}, ${context.cognitiveState})
- Mood: ${context.mood}
- Tasks: ${JSON.stringify(context.tasks, null, 2)}${insightLines.length > 0 ? "\n" + insightLines.join("\n") : ""}${excludeNote}

Your job:
1. Recommend ONE task from the list the user should do right now (or null if mood is tired and all tasks are high priority).${context.excludedTaskIds?.length ? " Avoid excluded task IDs." : ""}
2. Explain WHY in 2-3 warm sentences — reference neuroscience or positive psychology.
3. Add ONE warm, caring reward suggestion with an emoji — something the user would genuinely enjoy and feel good about (e.g. calling a friend, listening to a favourite song, going for a walk, watching an episode guilt-free). Write it as if you care about their happiness, not just their productivity. Be specific and human.
4. Provide 1-2 focus_tips: ultra-specific, actionable suggestions tailored to the task and mood. Examples: "Put your phone face-down across the room before you start", "Open only the ONE tab you need — close everything else", "Set a 25-min timer so your brain knows there's a finish line", "Play lo-fi or ambient music at low volume — lyrics distract, rhythm focuses", "If your mind wanders, write the distraction down and return — don't fight it". Avoid generic advice like "focus" or "take breaks". Be concrete.
5. Keep total response under 150 words.

Respond in JSON only — no markdown, no code block:
{
  "recommended_task_id": "uuid or null",
  "reason": "...",
  "reward": "...",
  "reward_emoji": "🎵",
  "focus_tips": ["tip1", "tip2"]
}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return parseClaudeRecommendation(text);
  } catch {
    return null;
  }
}

function parseClaudeRecommendation(text: string): LLMRecommendation | null {
  try {
    // Strip markdown code blocks if present
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      recommendedTaskId: parsed.recommended_task_id ?? null,
      reason: parsed.reason ?? "",
      reward: parsed.reward ?? "",
      rewardEmoji: parsed.reward_emoji ?? "✨",
      focusTips: Array.isArray(parsed.focus_tips) ? parsed.focus_tips.slice(0, 2) : [],
    };
  } catch {
    return null;
  }
}
