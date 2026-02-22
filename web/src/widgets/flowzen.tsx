import "@/index.css";
import { useEffect, useRef, useState } from "react";
import { mountWidget, useLayout, useWidgetState } from "skybridge/web";
import { useToolInfo, useCallTool } from "../helpers";
import { type Task } from "../components/types";
import { LoadingScreen } from "../components/LoadingScreen";
import { AddTaskForm } from "../components/AddTaskForm";

type Mood = "great" | "okay" | "tired";

const MOOD_OPTIONS: { value: Mood; emoji: string; label: string }[] = [
  { value: "great", emoji: "😊", label: "Great" },
  { value: "okay", emoji: "😐", label: "Okay" },
  { value: "tired", emoji: "😮‍💨", label: "Tired" },
];

interface FlowzenOutput {
  tasks: Task[];
  recommendation: Task | null;
  reason: string;
  reward: { emoji: string; text: string };
  focusTips?: string[];
  timeContext: string;
}

function ManageTasks() {
  const { output, isPending } = useToolInfo<"flowzen">();
  const { callToolAsync } = useCallTool("flowzen");
  const { theme } = useLayout();
  const isDark = theme === "dark";

  const [mood, setMood] = useState<Mood>("okay");
  const [widgetState, setWidgetState] = useWidgetState<{ tasks: Task[] }>();
  const [flowzenData, setFlowzenData] = useState<Omit<FlowzenOutput, "tasks"> | null>(null);
  const [focusTips, setFocusTips] = useState<string[]>([]);
  const [reasonExpanded, setReasonExpanded] = useState(false);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const mutationCounter = useRef(0);

  const safeTasks = (prev: { tasks?: Task[] } | null | undefined): Task[] =>
    prev?.tasks ?? [];

  // Sync widget state when server output changes
  useEffect(() => {
    const out = output as FlowzenOutput | undefined;
    if (out?.tasks) {
      setWidgetState(() => ({ tasks: out.tasks }));
      if (out.recommendation !== undefined) {
        setFlowzenData({
          recommendation: out.recommendation,
          reason: out.reason,
          reward: out.reward,
          timeContext: out.timeContext,
        });
        setFocusTips(out.focusTips ?? []);
      }
    }
  }, [output]);

  // Fall back to output directly if widgetState hasn't been hydrated yet
  const outputData = output as FlowzenOutput | undefined;
  const tasks = widgetState?.tasks ?? outputData?.tasks;

  if (isPending || tasks === undefined) {
    return <LoadingScreen isDark={isDark} />;
  }
  const todoCount = tasks.filter((t) => !t.completed).length;
  const doneCount = tasks.filter((t) => t.completed).length;

  const syncWithServer = async (args: Parameters<typeof callToolAsync>[0]) => {
    const id = ++mutationCounter.current;
    const result = await callToolAsync(args);
    if (id === mutationCounter.current && result?.structuredContent?.tasks) {
      const sc = result.structuredContent as FlowzenOutput;
      setWidgetState(() => ({ tasks: sc.tasks }));
      if (sc.recommendation !== undefined) {
        setFlowzenData({
          recommendation: sc.recommendation,
          reason: sc.reason,
          reward: sc.reward,
          timeContext: sc.timeContext,
        });
        setFocusTips(sc.focusTips ?? []);
      }
    }
  };

  const handleMoodChange = (newMood: Mood) => {
    setMood(newMood);
    setExcludedIds([]);
    syncWithServer({ mood: newMood });
  };

  const handleTryAnother = () => {
    if (!recommendation) return;
    const newExcluded = [...excludedIds, recommendation.id];
    setExcludedIds(newExcluded);
    syncWithServer({ excludedTaskIds: newExcluded, mood });
  };

  const handleAdd = (title: string, priority: "low" | "medium" | "high", dueDate: string | null) => {
    setWidgetState((prev) => ({
      tasks: [
        {
          id: `temp-${Date.now()}`,
          title,
          completed: false,
          priority,
          dueDate,
          createdAt: new Date().toISOString(),
        },
        ...safeTasks(prev),
      ],
    }));
    syncWithServer({ actions: [{ type: "add", title, priority, dueDate: dueDate ?? undefined }], mood });
  };

  const handleToggle = (taskId: string) => {
    setWidgetState((prev) => ({
      tasks: safeTasks(prev).map((t) =>
        t.id === taskId ? { ...t, completed: !t.completed } : t
      ),
    }));
    syncWithServer({ actions: [{ type: "toggle", taskId }], mood });
  };

  const handleDelete = (taskId: string) => {
    setWidgetState((prev) => ({
      tasks: safeTasks(prev).filter((t) => t.id !== taskId),
    }));
    syncWithServer({ actions: [{ type: "delete", taskId }], mood });
  };

  const recommendation = flowzenData?.recommendation ?? outputData?.recommendation ?? null;
  const reason = flowzenData?.reason ?? outputData?.reason ?? "";
  const reward = flowzenData?.reward ?? outputData?.reward;
  const timeContext = flowzenData?.timeContext ?? outputData?.timeContext ?? "";

  const effectiveFocusTips = focusTips.length > 0 ? focusTips : (outputData?.focusTips ?? []);
  const activeTasks = tasks.filter((t) => !t.completed);
  const doneTasks = tasks.filter((t) => t.completed);

  // Anthropic brand accent colors: orange · blue · green
  const PRIORITY_COLORS: Record<string, string> = {
    high: "#d97757",
    medium: "#6a9bcc",
    low: "#788c5d",
  };

  return (
    <div
      className={`flowzen-container ${isDark ? "dark" : "light"}`}
      data-llm={`Mood: ${mood}. Recommendation: ${recommendation?.title ?? "none"}. ${todoCount} active tasks, ${doneCount} done. Time: ${timeContext}.`}
    >
      {/* Header */}
      <div className="flowzen-header">
        <div className="flowzen-brand">
          <span className="flowzen-wave">🌊</span>
          <div className="flowzen-brand-text">
            <span className="flowzen-title">Flowzen</span>
            <span className="flowzen-tagline">Your cognitive compass</span>
          </div>
        </div>
        {timeContext && (
          <span className="flowzen-time-badge">{timeContext}</span>
        )}
      </div>

      {/* Mood Selector */}
      <div className="flowzen-section">
        <div className="flowzen-section-label">How are you feeling?</div>
        <div className="mood-selector">
          {MOOD_OPTIONS.map((m) => (
            <button
              key={m.value}
              className={`mood-btn ${mood === m.value ? "active" : ""}`}
              onClick={() => handleMoodChange(m.value)}
              aria-pressed={mood === m.value}
            >
              <span className="mood-emoji">{m.emoji}</span>
              <span className="mood-label">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recommendation Card */}
      {recommendation ? (
        <div className="recommendation-section">
          <div className="rec-header">
            <span className="rec-icon">⚡</span>
            <span className="rec-title">DO THIS NOW</span>
            <button className="try-another-btn" onClick={handleTryAnother}>
              Try another →
            </button>
          </div>
          <div className="rec-card">
            <div className="rec-task-title">{recommendation.title}</div>
            <div className="rec-task-meta">
              <span
                className="rec-priority-badge"
                style={{ background: `${PRIORITY_COLORS[recommendation.priority] ?? "#f59e0b"}22`, color: PRIORITY_COLORS[recommendation.priority] ?? "#f59e0b" }}
              >
                {recommendation.priority} priority
              </span>
            </div>
          </div>
          {reason && (
            <div className="rec-reason-wrapper">
              <button
                className="rec-reason-toggle"
                onClick={() => setReasonExpanded((v) => !v)}
              >
                <span className="rec-reason-icon">🧠</span>
                <span className="rec-reason-toggle-text">Why this task?</span>
                <span className="rec-reason-chevron">{reasonExpanded ? "▲" : "▼"}</span>
              </button>
              {reasonExpanded && (
                <div className="rec-reason">
                  <span className="rec-reason-text">{reason}</span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : tasks.length === 0 ? null : (
        <div className="recommendation-section">
          <div className="rec-card rec-card--empty">
            <div className="rec-task-title">All tasks complete! 🎉</div>
          </div>
          {reason && (
            <div className="rec-reason-wrapper">
              <button
                className="rec-reason-toggle"
                onClick={() => setReasonExpanded((v) => !v)}
              >
                <span className="rec-reason-icon">🧠</span>
                <span className="rec-reason-toggle-text">Why this task?</span>
                <span className="rec-reason-chevron">{reasonExpanded ? "▲" : "▼"}</span>
              </button>
              {reasonExpanded && (
                <div className="rec-reason">
                  <span className="rec-reason-text">{reason}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Focus Tips */}
      {effectiveFocusTips.length > 0 && recommendation && (
        <div className="focus-tips-section">
          {effectiveFocusTips.map((tip, i) => (
            <div key={i} className="focus-tip">
              <span className="focus-tip-icon">💡</span>
              <span className="focus-tip-text">{tip}</span>
            </div>
          ))}
        </div>
      )}

      {/* Happiness Reward */}
      {reward && recommendation && (
        <div className="reward-section">
          <div className="reward-header">
            <span className="reward-icon">😌</span>
            <span className="reward-title">AFTER THIS, YOU DESERVE:</span>
          </div>
          <div className="reward-card">
            <span className="reward-emoji">{reward.emoji}</span>
            <span className="reward-text">{reward.text}</span>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="flowzen-divider" />

      {/* Add Task */}
      <AddTaskForm onAdd={handleAdd} />

      {/* Task List */}
      <div className="flowzen-section">
        <div className="flowzen-section-label">
          📋 ALL TASKS
          <span className="task-count-badge">{activeTasks.length} active</span>
        </div>

        {tasks.length === 0 ? (
          <div className="flowzen-empty">
            No tasks yet — add one above to get your first recommendation.
          </div>
        ) : (
          <div className="flowzen-task-list">
            {activeTasks.map((task) => {
              const isRecommended = recommendation?.id === task.id;
              return (
                <div
                  key={task.id}
                  className={`flowzen-task-item ${isRecommended ? "recommended" : ""}`}
                >
                  <button
                    className="flowzen-checkbox"
                    onClick={() => handleToggle(task.id)}
                    aria-label="Mark complete"
                  />
                  <div className="flowzen-task-content">
                    <span className="flowzen-task-title">{task.title}</span>
                    <div className="flowzen-task-meta">
                      <span
                        className="flowzen-priority-dot"
                        style={{ background: PRIORITY_COLORS[task.priority] ?? "#f59e0b" }}
                        title={`${task.priority} priority`}
                      />
                      <span className="flowzen-priority-label" style={{ color: PRIORITY_COLORS[task.priority] ?? "#f59e0b" }}>
                        {task.priority}
                      </span>
                    </div>
                  </div>
                  {isRecommended && <span className="now-badge">NOW</span>}
                  <button
                    className="flowzen-delete-btn"
                    onClick={() => handleDelete(task.id)}
                    aria-label="Delete task"
                  >
                    ×
                  </button>
                </div>
              );
            })}

            {doneTasks.length > 0 && (
              <>
                <div className="done-section-label">Completed</div>
                {doneTasks.map((task) => (
                  <div key={task.id} className="flowzen-task-item done">
                    <button
                      className="flowzen-checkbox checked"
                      onClick={() => handleToggle(task.id)}
                      aria-label="Mark incomplete"
                    >
                      ✓
                    </button>
                    <div className="flowzen-task-content">
                      <span className="flowzen-task-title done-title">{task.title}</span>
                    </div>
                    <button
                      className="flowzen-delete-btn"
                      onClick={() => handleDelete(task.id)}
                      aria-label="Delete task"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ManageTasks;

mountWidget(<ManageTasks />);
