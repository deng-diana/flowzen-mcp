import { supabase } from "./supabase.js";

export interface UserInsights {
  completionCount: number;
  bestTimeWindows: string[];
  recentCompletions: string[];
}

export async function fetchUserInsights(userId: string): Promise<UserInsights> {
  try {
    // Fetch last 30 completion events
    const { data: events } = await supabase
      .from("user_completion_events")
      .select("time_window, task_id")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(30);

    if (!events || events.length === 0) {
      return { completionCount: 0, bestTimeWindows: [], recentCompletions: [] };
    }

    // Count time_window frequency
    const windowCounts: Record<string, number> = {};
    for (const e of events) {
      if (e.time_window) {
        windowCounts[e.time_window] = (windowCounts[e.time_window] ?? 0) + 1;
      }
    }
    const bestTimeWindows = Object.entries(windowCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([w]) => w);

    // Fetch titles for the 3 most recent completed tasks
    const recentTaskIds = events.slice(0, 3).map((e) => e.task_id).filter(Boolean);
    let recentCompletions: string[] = [];
    if (recentTaskIds.length > 0) {
      const { data: recentTasks } = await supabase
        .from("tasks")
        .select("title")
        .in("id", recentTaskIds);
      recentCompletions = (recentTasks ?? []).map((t) => t.title);
    }

    return {
      completionCount: events.length,
      bestTimeWindows,
      recentCompletions,
    };
  } catch {
    return { completionCount: 0, bestTimeWindows: [], recentCompletions: [] };
  }
}

export async function logRecommendation(params: {
  userId: string;
  recommendedTaskId: string | null;
  mood: string;
  timeWindow: string;
  reasonText: string;
}): Promise<void> {
  try {
    await supabase.from("recommendation_log").insert({
      user_id: params.userId,
      recommended_task_id: params.recommendedTaskId ?? null,
      mood: params.mood,
      time_window: params.timeWindow,
      reason_text: params.reasonText,
    });
  } catch {
    // fire-and-forget: silently ignore errors
  }
}

export async function recordCompletion(params: {
  userId: string;
  taskId: string;
  mood: string;
  timeWindow: string;
  wasRecommended: boolean;
}): Promise<void> {
  try {
    await supabase.from("user_completion_events").insert({
      user_id: params.userId,
      task_id: params.taskId,
      mood_at_completion: params.mood,
      time_window: params.timeWindow,
      was_recommended: params.wasRecommended,
    });

    // Upsert user_preferences: increment completion_count, update best_time_windows
    const { data: existing } = await supabase
      .from("user_preferences")
      .select("completion_count, best_time_windows")
      .eq("user_id", params.userId)
      .single();

    const newCount = (existing?.completion_count ?? 0) + 1;
    const windows: string[] = existing?.best_time_windows ?? [];
    if (params.timeWindow && !windows.includes(params.timeWindow)) {
      windows.push(params.timeWindow);
    }

    await supabase.from("user_preferences").upsert({
      user_id: params.userId,
      completion_count: newCount,
      best_time_windows: windows,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // fire-and-forget
  }
}
