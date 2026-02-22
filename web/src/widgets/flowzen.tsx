import "@/index.css";
import { useEffect, useRef, useState, useCallback } from "react";
import { mountWidget, useLayout, useWidgetState, useDisplayMode } from "skybridge/web";
import { useToolInfo, useCallTool } from "../helpers";
import { type Task } from "../components/types";
import { LoadingScreen } from "../components/LoadingScreen";

type Mood = "great" | "okay" | "tired";

const MOOD_OPTIONS: { value: Mood; emoji: string; label: string; sub: string }[] = [
  { value: "great", emoji: "🔥", label: "On fire",    sub: "Ready to crush it" },
  { value: "okay",  emoji: "🙂", label: "Getting by", sub: "Steady, not spectacular" },
  { value: "tired", emoji: "🌿", label: "Low energy", sub: "Need gentle wins" },
];

interface FlowzenOutput {
  tasks: Task[];
  recommendation: Task | null;
  reason: string;
  reward: { emoji: string; text: string };
  focusTips?: string[];
  timeContext: string;
}

/** Split a reason string into bullet points for cleaner display */
function parseReasonBullets(reason: string): string[] {
  // Try sentence-level split on ". " boundaries, keep each as a bullet
  const sentences = reason
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  // If we got 2+ sentences, use them as bullets; otherwise treat as one block
  return sentences.length >= 2 ? sentences : [reason];
}

/** Shorten a focus tip to ≤ 10 words for minimal cognitive load */
function shortenTip(tip: string): string {
  // Strip emoji prefix if present
  const clean = tip.replace(/^[^\w]+/, "").trim();
  const words = clean.split(" ");
  if (words.length <= 10) return clean;
  return words.slice(0, 10).join(" ") + "…";
}

import logoSrc from "../assets/flowzen-logo.svg";

// Flowzen Logo — using imported custom design
function FlowzenLogo({ size = 36 }: { size?: number }) {
  return (
    <img 
      src={logoSrc} 
      alt="Flowzen Logo" 
      width={size} 
      height={size} 
      style={{ flexShrink: 0, borderRadius: "50%" }} 
    />
  );
}

function ManageTasks() {
  const { output, isPending } = useToolInfo<"flowzen">();
  const { callToolAsync } = useCallTool("flowzen");
  const { maxHeight } = useLayout();
  const [displayMode, setDisplayMode] = useDisplayMode();


  const [mood, setMood] = useState<Mood>("okay");
  const [widgetState, setWidgetState] = useWidgetState<{ tasks: Task[] }>();
  const [flowzenData, setFlowzenData] = useState<Omit<FlowzenOutput, "tasks"> | null>(null);
  const [focusTips, setFocusTips] = useState<string[]>([]);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const mutationCounter = useRef(0);

  // Inline editing state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Inline add form state (in ALL TASKS header)
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addPriority, setAddPriority] = useState<"low" | "medium" | "high">("medium");
  const addInputRef = useRef<HTMLInputElement>(null);

  const safeTasks = (prev: { tasks?: Task[] } | null | undefined): Task[] =>
    prev?.tasks ?? [];

  // Helper: apply server result to local state (used by auto-fetch and syncWithServer)
  const applyServerResult = useCallback((result: { structuredContent?: FlowzenOutput } | null | undefined) => {
    const sc = result?.structuredContent as FlowzenOutput | undefined;
    if (sc?.tasks) {
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
  }, []);

  // Auto-fetch on mount if no data yet (cold open).
  // callToolAsync returns data directly — useToolInfo.output is NOT updated by callToolAsync.
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (!hasFetchedRef.current && widgetState == null && output == null) {
      hasFetchedRef.current = true;
      callToolAsync({ mood }).then(applyServerResult).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync widget state when Claude calls the tool (output updated by host)
  useEffect(() => {
    const out = output as FlowzenOutput | null | undefined;
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

  // output is null (not undefined) when no tool call has happened yet per Skybridge internals
  const outputData = (output ?? null) as FlowzenOutput | null;
  const tasks = widgetState?.tasks ?? outputData?.tasks ?? null;

  if (tasks === null) {
    return <LoadingScreen />;
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
    // Reset excluded IDs when mood changes — fresh recommendation
    setExcludedIds([]);
    syncWithServer({ mood: newMood });
  };

  const handleTryAnother = () => {
    const currentRec = recommendation;
    if (!currentRec) return;
    const newExcluded = [...excludedIds, currentRec.id];
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

  const openAddForm = () => {
    setIsAddOpen(true);
    setTimeout(() => {
      addInputRef.current?.focus();
    }, 50);
  };

  const closeAddForm = () => {
    setIsAddOpen(false);
    setAddTitle("");
    setAddPriority("medium");
  };

  const submitAdd = () => {
    if (!addTitle.trim()) { closeAddForm(); return; }
    handleAdd(addTitle.trim(), addPriority, null);
    closeAddForm();
  };

  const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); submitAdd(); }
    else if (e.key === "Escape") { closeAddForm(); }
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

  const handleDoubleClick = (task: Task) => {
    if (task.completed) return; // Don't allow editing completed tasks
    setEditingTaskId(task.id);
    setEditingValue(task.title);
    // Focus the input after render
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 0);
  };

  const handleEditSave = useCallback((taskId: string) => {
    const trimmed = editingValue.trim();
    setEditingTaskId(null);
    if (!trimmed) return; // Empty → discard
    // Optimistic update
    setWidgetState((prev) => ({
      tasks: safeTasks(prev).map((t) =>
        t.id === taskId ? { ...t, title: trimmed } : t
      ),
    }));
    syncWithServer({ actions: [{ type: "rename", taskId, title: trimmed }], mood });
  }, [editingValue, mood]);

  const handleEditCancel = () => {
    setEditingTaskId(null);
    setEditingValue("");
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, taskId: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEditSave(taskId);
    } else if (e.key === "Escape") {
      handleEditCancel();
    }
  };

  const recommendation = flowzenData?.recommendation ?? outputData?.recommendation ?? null;
  const reason = flowzenData?.reason ?? outputData?.reason ?? "";
  const reward = flowzenData?.reward ?? outputData?.reward;
  const timeContext = flowzenData?.timeContext ?? outputData?.timeContext ?? "";

  const effectiveFocusTips = focusTips.length > 0 ? focusTips : (outputData?.focusTips ?? []);
  const activeTasks = tasks.filter((t) => !t.completed);
  const doneTasks = tasks.filter((t) => t.completed);

  const reasonBullets = reason ? parseReasonBullets(reason) : [];

  const PRIORITY_COLORS: Record<string, string> = {
    high: "#d97757",
    medium: "#6a9bcc",
    low: "#788c5d",
  };

  const isFullscreen = displayMode === "fullscreen";

  return (
    <div
      className={`flowzen-container light${isFullscreen ? " fullscreen" : ""}`}
      style={isFullscreen ? { maxHeight: maxHeight, overflowY: "auto" } : { maxHeight: maxHeight ?? 600 }}
      data-llm={`Mood: ${mood}. Recommendation: ${recommendation?.title ?? "none"}. ${todoCount} active tasks, ${doneCount} done. Time: ${timeContext}.`}
    >
      {/* Header */}
      <div className="flowzen-header">
        <div className="flowzen-brand">
          <FlowzenLogo size={36} />
          <div className="flowzen-brand-text">
            <span className="flowzen-title">Flowzen</span>
            <span className="flowzen-tagline">Do the right thing, right now.</span>
          </div>
        </div>
        <div className="flowzen-header-right">
          {timeContext && (
            <span className="flowzen-time-badge">{timeContext}</span>
          )}
          <button
            className={`flowzen-expand-btn${isFullscreen ? " active" : ""}`}
            onClick={() => setDisplayMode(isFullscreen ? "inline" : "fullscreen")}
            aria-label={isFullscreen ? "收起" : "全屏展开"}
            title={isFullscreen ? "收起" : "全屏展开"}
          >
            {isFullscreen ? "⊠" : "⊞"}
          </button>
        </div>
      </div>

      {/* Mood Selector — always visible */}
      <div className="mood-card">
          <div className="mood-card-label">HOW ARE YOU FEELING?</div>
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
                <span className="mood-sub">{m.sub}</span>
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
              Show me another
            </button>
          </div>
          <div className="rec-card">
            <div className="rec-task-title">{recommendation.title}</div>
            <div className="rec-task-meta">
              <span
                className="rec-priority-badge"
                style={{
                  background: `${PRIORITY_COLORS[recommendation.priority] ?? "#b0aea5"}18`,
                  color: PRIORITY_COLORS[recommendation.priority] ?? "#b0aea5",
                  border: `1px solid ${PRIORITY_COLORS[recommendation.priority] ?? "#b0aea5"}40`,
                }}
              >
                {recommendation.priority === "high" ? "HIGH PRIORITY" : recommendation.priority === "medium" ? "MED PRIORITY" : "LOW PRIORITY"}
              </span>
            </div>
          </div>

          {/* Why this task — always expanded, bullet point format */}
          {reasonBullets.length > 0 && (
            <div className="rec-reason-wrapper">
              <div className="rec-reason-header">
                <span className="rec-reason-icon">🧠</span>
                <span className="rec-reason-label">Why this task?</span>
              </div>
              <div className="rec-reason">
                {reasonBullets.map((bullet, i) => (
                  <div key={i} className="rec-reason-bullet">
                    <span className="rec-reason-dot">·</span>
                    <span
                      className="rec-reason-text"
                      dangerouslySetInnerHTML={{
                        __html: bullet
                          // Bold key neuro terms
                          .replace(/(cortisol|prefrontal cortex|dopamine|serotonin|BDNF|cognitive|melatonin|focus window|energy peak)/gi,
                            "<strong>$1</strong>")
                          // Bold time expressions like "It's 10:30"
                          .replace(/(It's \d+:\d+)/g, "<strong>$1</strong>"),
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : tasks.length === 0 ? null : (
        <div className="recommendation-section">
          <div className="rec-card rec-card--empty">
            <div className="rec-task-title">All tasks complete! 🎉</div>
          </div>
        </div>
      )}

      {/* Focus Tips — shortened, minimal */}
      {effectiveFocusTips.length > 0 && recommendation && (
        <div className="focus-tips-section">
          {effectiveFocusTips.slice(0, 2).map((tip, i) => (
            <div key={i} className="focus-tip">
              <span className="focus-tip-icon">💡</span>
              <span className="focus-tip-text">{shortenTip(tip)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Happiness Reward */}
      {reward && recommendation && (
        <div className="reward-section">
          <div className="reward-header">
            <span className="reward-icon">🎁</span>
            <span className="reward-title">YOU DESERVE</span>
          </div>
          <div className="reward-card">
            <span className="reward-emoji">{reward.emoji}</span>
            <span className="reward-text">{reward.text}</span>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="flowzen-divider" />

      {/* ALL TASKS Section */}
      <div className="flowzen-section">

        {/* Section header with inline + Add task button */}
        <div className="flowzen-section-label">
          <span>ALL TASKS</span>
          {activeTasks.length > 0 && (
            <span className="task-count-badge">{activeTasks.length} active</span>
          )}
          <button
            className="add-task-inline-btn"
            onClick={openAddForm}
            aria-label="Add a new task"
          >
            + Add task
          </button>
        </div>

        {/* Inline add form — slides in below the header */}
        {isAddOpen && (
          <div className="inline-add-form">
            <input
              ref={addInputRef}
              type="text"
              className="add-input"
              placeholder='e.g. "Finish project proposal"'
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              onKeyDown={handleAddKeyDown}
              autoComplete="off"
              maxLength={120}
            />
            <div className="add-row">
              <div className="priority-chips">
                {([
                  { value: "high" as const, label: "High", color: "#d97757" },
                  { value: "medium" as const, label: "Med", color: "#6a9bcc" },
                  { value: "low" as const, label: "Low", color: "#788c5d" },
                ]).map((p) => (
                  <button
                    key={p.value}
                    className={`priority-chip ${addPriority === p.value ? "active" : ""}`}
                    style={addPriority === p.value ? { color: p.color, borderColor: p.color + "55", background: p.color + "11" } : {}}
                    onClick={() => setAddPriority(p.value)}
                    type="button"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button className="add-btn" onClick={submitAdd}>
                Add ↵
              </button>
              <button className="add-cancel-btn" onClick={closeAddForm} type="button" aria-label="Cancel">
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Empty State — new user, zero tasks */}
        {tasks.length === 0 && !isAddOpen ? (
          <div className="flowzen-empty-state">
            <div className="empty-state-icon">🌊</div>
            <div className="empty-state-heading">What's on your plate today?</div>
            <button className="empty-cta-btn" onClick={openAddForm}>
              + Add your first task
            </button>
          </div>
        ) : tasks.length > 0 ? (
          <div className="flowzen-task-list">
            {activeTasks.map((task) => {
              const isRecommended = recommendation?.id === task.id;
              const isEditing = editingTaskId === task.id;
              return (
                <div
                  key={task.id}
                  className={`flowzen-task-item ${isRecommended ? "recommended" : ""} ${isEditing ? "editing" : ""}`}
                >
                  {!isEditing && (
                    <button
                      className="flowzen-checkbox"
                      onClick={() => handleToggle(task.id)}
                      aria-label="Mark complete"
                    />
                  )}

                  <div className="flowzen-task-content">
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        className="flowzen-task-edit-input"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => handleEditKeyDown(e, task.id)}
                        onBlur={() => handleEditSave(task.id)}
                        maxLength={120}
                        aria-label="Edit task title"
                      />
                    ) : (
                      <span
                        className="flowzen-task-title"
                        onDoubleClick={() => handleDoubleClick(task)}
                        title="Double-click to edit"
                      >
                        {task.title}
                      </span>
                    )}

                    {!isEditing && (
                      <div className="flowzen-task-meta">
                        <span
                          className="flowzen-priority-dot"
                          style={{ background: PRIORITY_COLORS[task.priority] ?? "#b0aea5" }}
                          title={`${task.priority} priority`}
                        />
                        <span className="flowzen-priority-label" style={{ color: PRIORITY_COLORS[task.priority] ?? "#b0aea5" }}>
                          {task.priority}
                        </span>
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="flowzen-edit-actions">
                      <span className="flowzen-edit-hint">↵ save · esc cancel</span>
                    </div>
                  ) : (
                    <>
                      {isRecommended && <span className="now-badge">NOW</span>}
                      <button
                        className="flowzen-delete-btn"
                        onClick={() => handleDelete(task.id)}
                        aria-label="Delete task"
                      >
                        ×
                      </button>
                    </>
                  )}
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
        ) : null}
      </div>
    </div>
  );
}

export default ManageTasks;

mountWidget(<ManageTasks />);
