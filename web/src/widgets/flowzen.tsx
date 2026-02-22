import "@/index.css";
import { useRef, useState, useCallback } from "react";
import { mountWidget, useLayout, useWidgetState } from "skybridge/web";
import React from "react";
import { useToolInfo, useCallTool } from "../helpers";
import { type Task, DIFFICULTY_COLORS } from "../components/types";
import { LoadingScreen } from "../components/LoadingScreen";

type Mood = "great" | "okay" | "tired";

const MOOD_OPTIONS: { value: Mood; emoji: string; label: string; sub: string }[] = [
  { value: "great", emoji: "🔥", label: "On fire",    sub: "Ready to do great work" },
  { value: "okay",  emoji: "🙂", label: "Just okay",  sub: "Moving along, step by step" },
  { value: "tired", emoji: "😴", label: "Low energy", sub: "Start small, build up slowly" },
];

const CELEBRATION_MESSAGES = [
  { emoji: "✓", text: "Done! That mattered." },
  { emoji: "⚡", text: "Momentum building." },
  { emoji: "✓", text: "One less thing. Well done." },
  { emoji: "🎯", text: "Task complete. Feel that." },
  { emoji: "✓", text: "Progress is progress." },
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
  const sentences = reason
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  return sentences.length >= 2 ? sentences : [reason];
}

/** Strip leading emoji from focus tip for clean display */
function cleanTip(tip: string): string {
  return tip.replace(/^[\p{Emoji}\s]+/u, "").trim() || tip.trim();
}

import logoSrc from "../assets/flowzen-logo.svg";

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
  const { output } = useToolInfo<"flowzen">();
  const { callToolAsync } = useCallTool("flowzen");
  const { maxHeight } = useLayout();
  const [displayMode, setDisplayMode] = useState<string>("inline");

  const [mood, setMood] = useState<Mood>("okay");
  const [widgetState, setWidgetState] = useWidgetState<{ tasks: Task[] }>();
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const mutationCounter = useRef(0);
  // Server response data stored in a ref (no re-render on write) to avoid useEffect loops.
  // A version counter triggers exactly ONE re-render when new server data arrives.
  const serverDataRef = useRef<Omit<FlowzenOutput, "tasks"> & { focusTips: string[] } | null>(null);
  const [serverDataVersion, setServerDataVersion] = useState(0);
  // Loading indicator: shows skeleton during mood change / show-another
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Increments only after a skeleton-visible refresh completes — triggers rec-card entrance animation
  const [recAnimKey, setRecAnimKey] = useState(0);

  // Celebration toast state
  const [celebration, setCelebration] = useState<{ emoji: string; text: string } | null>(null);
  const [celebrationLeaving, setCelebrationLeaving] = useState(false);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Start this task" accepted state
  const [acceptedTaskId, setAcceptedTaskId] = useState<string | null>(null);

  // Task drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Inline editing state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Inline add form state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addPriority, setAddPriority] = useState<"low" | "medium" | "high">("medium");
  const [addDifficulty, setAddDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const addInputRef = useRef<HTMLInputElement>(null);

  const safeTasks = (prev: { tasks?: Task[] } | null | undefined): Task[] =>
    prev?.tasks ?? [];

  const outputData = output as FlowzenOutput | null;

  // No useEffect needed — server data is stored in a ref and displayed via derived values below.
  // This completely eliminates the setWidgetState→output→useEffect infinite loop (React #185).
  const tasks = widgetState?.tasks ?? outputData?.tasks ?? null;

  const syncWithServer = async (args: Parameters<typeof callToolAsync>[0], showLoading = false) => {
    const id = ++mutationCounter.current;
    if (showLoading) setIsRefreshing(true);
    const result = await callToolAsync(args);
    if (id === mutationCounter.current) {
      setIsRefreshing(false);
      if (result?.structuredContent?.tasks) {
        const sc = result.structuredContent as FlowzenOutput;
        serverDataRef.current = {
          recommendation: sc.recommendation,
          reason: sc.reason,
          reward: sc.reward,
          timeContext: sc.timeContext,
          focusTips: sc.focusTips ?? [],
        };
        setWidgetState(() => ({ tasks: sc.tasks }));
        setServerDataVersion((v) => v + 1);
        if (showLoading) setRecAnimKey((k) => k + 1);
      }
    }
  };

  const showCelebration = (_taskTitle?: string) => {
    if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
    const msg = CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)];
    setCelebration(msg);
    setCelebrationLeaving(false);
    celebrationTimerRef.current = setTimeout(() => {
      setCelebrationLeaving(true);
      celebrationTimerRef.current = setTimeout(() => {
        setCelebration(null);
        setCelebrationLeaving(false);
      }, 220);
    }, 2200);
  };

  const handleMoodChange = (newMood: Mood) => {
    setMood(newMood);
    setExcludedIds([]);
    syncWithServer({ mood: newMood }, true);
  };

  const handleAdd = (title: string, priority: "low" | "medium" | "high", difficulty: "easy" | "medium" | "hard", dueDate: string | null) => {
    setWidgetState((prev) => ({
      tasks: [
        {
          id: `temp-${Date.now()}`,
          title,
          completed: false,
          priority,
          difficulty,
          dueDate,
          createdAt: new Date().toISOString(),
        },
        ...safeTasks(prev),
      ],
    }));
    syncWithServer({ actions: [{ type: "add", title, priority, difficulty, dueDate: dueDate ?? undefined }], mood });
  };

  const openAddForm = () => {
    setIsAddOpen(true);
    setTimeout(() => { addInputRef.current?.focus(); }, 50);
  };

  const closeAddForm = () => {
    setIsAddOpen(false);
    setAddTitle("");
    setAddPriority("medium");
    setAddDifficulty("medium");
  };

  const submitAdd = () => {
    if (!addTitle.trim()) { closeAddForm(); return; }
    handleAdd(addTitle.trim(), addPriority, addDifficulty, null);
    closeAddForm();
  };

  const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); submitAdd(); }
    else if (e.key === "Escape") { closeAddForm(); }
  };

  const handleToggle = (taskId: string, currentRecommendedId?: string) => {
    const taskBeforeToggle = tasks?.find((t) => t.id === taskId);
    const isCompleting = taskBeforeToggle && !taskBeforeToggle.completed;

    setWidgetState((prev) => ({
      tasks: safeTasks(prev).map((t) =>
        t.id === taskId ? { ...t, completed: !t.completed } : t
      ),
    }));

    if (isCompleting && taskBeforeToggle) {
      showCelebration(taskBeforeToggle.title);
    }

    syncWithServer({
      actions: [{ type: "toggle", taskId }],
      mood,
      currentRecommendedId,
    });
  };

  const handleDelete = (taskId: string) => {
    setWidgetState((prev) => ({
      tasks: safeTasks(prev).filter((t) => t.id !== taskId),
    }));
    syncWithServer({ actions: [{ type: "delete", taskId }], mood });
  };

  const handleDoubleClick = (task: Task) => {
    if (task.completed) return;
    setEditingTaskId(task.id);
    setEditingValue(task.title);
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 0);
  };

  const handleEditSave = useCallback((taskId: string) => {
    const trimmed = editingValue.trim();
    setEditingTaskId(null);
    if (!trimmed) return;
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
    if (e.key === "Enter") { e.preventDefault(); handleEditSave(taskId); }
    else if (e.key === "Escape") { handleEditCancel(); }
  };

  const handlePriorityChange = (taskId: string, newPriority: "low" | "medium" | "high") => {
    setWidgetState((prev) => ({
      tasks: safeTasks(prev).map((t) =>
        t.id === taskId ? { ...t, priority: newPriority } : t
      ),
    }));
    syncWithServer({ actions: [{ type: "update_priority", taskId, priority: newPriority }], mood });
  };

  const handleDifficultyChange = (taskId: string, newDifficulty: "easy" | "medium" | "hard") => {
    setWidgetState((prev) => ({
      tasks: safeTasks(prev).map((t) =>
        t.id === taskId ? { ...t, difficulty: newDifficulty } : t
      ),
    }));
    syncWithServer({ actions: [{ type: "update_difficulty", taskId, difficulty: newDifficulty }], mood });
  };

  // === Early return AFTER all hooks ===
  if (tasks === null) {
    return <LoadingScreen />;
  }

  const todoCount = tasks.filter((t) => !t.completed).length;
  const doneCount = tasks.filter((t) => t.completed).length;

  // Derive display values: prefer fresh server data (from user actions), fall back to outputData (initial AI call)
  const sd = serverDataRef.current;
  const recommendation = sd?.recommendation ?? outputData?.recommendation ?? null;
  const reason = sd?.reason ?? outputData?.reason ?? "";
  const reward = sd?.reward ?? outputData?.reward;
  const timeContext = sd?.timeContext ?? outputData?.timeContext ?? "";
  const effectiveFocusTips = sd?.focusTips ?? outputData?.focusTips ?? [];

  // Suppress unused-variable warning — serverDataVersion is only used to trigger re-renders
  void serverDataVersion;

  const handleTryAnother = () => {
    if (!recommendation) return;
    const newExcluded = [...excludedIds, recommendation.id];
    setExcludedIds(newExcluded);
    syncWithServer({ excludedTaskIds: newExcluded, mood }, true);
  };

  const handleStartTask = () => {
    if (!recommendation) return;
    setAcceptedTaskId(recommendation.id);
    syncWithServer({ acceptRecommendationId: recommendation.id, mood });
  };
  const activeTasks = tasks.filter((t) => !t.completed);
  const doneTasks = tasks.filter((t) => t.completed);

  const reasonBullets = reason ? parseReasonBullets(reason) : [];

  const PRIORITY_COLORS: Record<string, string> = {
    high: "#d97757",
    medium: "#6a9bcc",
    low: "#788c5d",
  };

  const isFullscreen = displayMode === "fullscreen";
  const isAccepted = acceptedTaskId === recommendation?.id;

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
          <button
            className="tasks-drawer-trigger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open task list"
          >
            <span className="tasks-trigger-label">My Tasks</span>
            {todoCount > 0 && (
              <span className="tasks-trigger-badge">{todoCount}</span>
            )}
            <span className="tasks-trigger-arrow">›</span>
          </button>
          <button
            className={`flowzen-expand-btn${isFullscreen ? " active" : ""}`}
            onClick={() => setDisplayMode(isFullscreen ? "inline" : "fullscreen")}
            aria-label={isFullscreen ? "Collapse" : "Expand"}
            title={isFullscreen ? "Collapse" : "Expand"}
          >
            {isFullscreen ? "⊠" : "⊞"}
          </button>
        </div>
      </div>

      {/* Mood Selector */}
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
              <span className="mood-text-group">
                <span className="mood-label">{m.label}</span>
                <span className="mood-sub">{m.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Recommendation Card — skeleton during loading, animated card on arrive */}
      {isRefreshing ? (
        /* ── SKELETON: instant feedback while waiting for server ── */
        <div className="recommendation-section">
          <div className="rec-header">
            <span className="rec-icon">⚡</span>
            <span className="rec-title">DO THIS NOW</span>
          </div>
          <div className="rec-skeleton-card">
            <div className="rec-skeleton-line rec-skeleton-title" />
            <div className="rec-skeleton-line rec-skeleton-badge" />
            <div className="rec-skeleton-btn" />
          </div>
        </div>
      ) : recommendation ? (
        /* ── LOADED STATE ── */
        <div className="recommendation-section">

          {/* ── BEFORE START: show task + CTA only ── */}
          {!isAccepted && (
            <>
              <div className="rec-header">
                <span className="rec-icon">⚡</span>
                <span className="rec-title">DO THIS NOW</span>
                <button className="try-another-btn" onClick={handleTryAnother}>
                  Try another
                </button>
              </div>
              {/* key on rec-card triggers entrance animation after each mood/another refresh */}
              <div className="rec-card rec-card-enter" key={recAnimKey}>
                <div className="rec-task-row">
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
                      {recommendation.priority === "high" ? "HIGH" : recommendation.priority === "medium" ? "MED" : "LOW"}
                    </span>
                    <span
                      className="rec-priority-badge"
                      style={{
                        background: `${DIFFICULTY_COLORS[recommendation.difficulty ?? "medium"] ?? "#b0aea5"}18`,
                        color: DIFFICULTY_COLORS[recommendation.difficulty ?? "medium"] ?? "#b0aea5",
                        border: `1px solid ${DIFFICULTY_COLORS[recommendation.difficulty ?? "medium"] ?? "#b0aea5"}40`,
                      }}
                    >
                      {recommendation.difficulty === "easy" ? "EASY" : recommendation.difficulty === "hard" ? "HARD" : "MED"}
                    </span>
                  </div>
                </div>

                {/* Why this task — shown immediately so user understands before committing */}
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
                                .replace(/(cortisol|prefrontal cortex|dopamine|serotonin|BDNF|cognitive|melatonin|focus window|energy peak)/gi,
                                  "<strong>$1</strong>")
                                .replace(/(It's \d+:\d+)/g, "<strong>$1</strong>"),
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button className="start-task-btn" onClick={handleStartTask}>
                  I'm ready →
                </button>
              </div>
            </>
          )}

          {/* ── AFTER START: in-progress state + coaching reveal ── */}
          {isAccepted && (
            <>
              {/* In-progress bar */}
              <div className="in-progress-bar">
                <span className="in-progress-dot" />
                <span className="in-progress-label">IN PROGRESS</span>
                <span className="in-progress-task-title">{recommendation.title}</span>
                <button
                  className="mark-done-btn"
                  onClick={() => handleToggle(recommendation.id, recommendation.id)}
                >
                  ✓ Done
                </button>
              </div>

              {/* Coaching section — fades in after commitment (Why is already shown above) */}
              <div className="coaching-reveal">
                {/* Focus Tips */}
                {effectiveFocusTips.length > 0 && (
                  <div className="focus-tips-section">
                    {effectiveFocusTips.slice(0, 2).map((tip, i) => (
                      <div key={i} className="focus-tip">
                        <span className="focus-tip-icon">💡</span>
                        <span className="focus-tip-text">{cleanTip(tip)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reward */}
                {reward && (
                  <div className="reward-section">
                    <div className="reward-header">
                      <span className="reward-icon">🎁</span>
                      <span className="reward-title">YOU DESERVE AFTER</span>
                    </div>
                    <div className="reward-card">
                      <span className="reward-emoji">{reward.emoji}</span>
                      <span className="reward-text">{reward.text}</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : activeTasks.length === 0 ? (
        <div className="recommendation-section">
          <div className="rec-card rec-card--empty">
            <div className="rec-task-title">All tasks complete! 🎉</div>
          </div>
        </div>
      ) : null}

      {/* Celebration Toast */}
      {celebration && (
        <div className={`celebration-toast${celebrationLeaving ? " leaving" : ""}`}>
          <span className="celebration-toast-emoji">{celebration.emoji}</span>
          <span>{celebration.text}</span>
        </div>
      )}

      {/* Task Drawer Backdrop */}
      {drawerOpen && (
        <div
          className="task-drawer-backdrop"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Task Drawer */}
      <div className={`task-drawer${drawerOpen ? " open" : ""}`} role="dialog" aria-label="All Tasks">
        {/* Drawer Header */}
        <div className="task-drawer-header">
          <div className="task-drawer-title-row">
            <span className="task-drawer-title">ALL TASKS</span>
            {activeTasks.length > 0 && (
              <span className="task-count-badge">{activeTasks.length} active</span>
            )}
          </div>
          <div className="task-drawer-actions">
            <button
              className="add-task-inline-btn"
              onClick={() => { openAddForm(); }}
              aria-label="Add a new task"
            >
              + Add task
            </button>
            <button
              className="task-drawer-close"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close task list"
            >
              ×
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="task-drawer-body">
          {/* Inline add form */}
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
                <span className="add-row-sep">·</span>
                <div className="priority-chips">
                  {([
                    { value: "easy" as const, label: "Easy", color: "#788c5d" },
                    { value: "medium" as const, label: "Med", color: "#b08a4a" },
                    { value: "hard" as const, label: "Hard", color: "#c0556e" },
                  ]).map((d) => (
                    <button
                      key={d.value}
                      className={`priority-chip ${addDifficulty === d.value ? "active" : ""}`}
                      style={addDifficulty === d.value ? { color: d.color, borderColor: d.color + "55", background: d.color + "11" } : {}}
                      onClick={() => setAddDifficulty(d.value)}
                      type="button"
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <button className="add-btn" onClick={submitAdd}>Add ↵</button>
                <button className="add-cancel-btn" onClick={closeAddForm} type="button" aria-label="Cancel">✕</button>
              </div>
            </div>
          )}

          {/* Empty State */}
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
                        onClick={() => handleToggle(task.id, recommendation?.id)}
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
                          />
                          <div className="priority-select-wrapper" style={{ color: PRIORITY_COLORS[task.priority] ?? "#b0aea5" }}>
                            <select
                              className="priority-select"
                              value={task.priority}
                              onChange={(e) => handlePriorityChange(task.id, e.target.value as "low" | "medium" | "high")}
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Change priority"
                            >
                              <option value="high">HIGH</option>
                              <option value="medium">MED</option>
                              <option value="low">LOW</option>
                            </select>
                            <span className="priority-select-arrow">▾</span>
                          </div>
                          <span className="task-meta-sep">·</span>
                          <div className="priority-select-wrapper" style={{ color: DIFFICULTY_COLORS[task.difficulty ?? "medium"] ?? "#b0aea5" }}>
                            <select
                              className="priority-select"
                              value={task.difficulty ?? "medium"}
                              onChange={(e) => handleDifficultyChange(task.id, e.target.value as "easy" | "medium" | "hard")}
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Change difficulty"
                            >
                              <option value="hard">HARD</option>
                              <option value="medium">MED</option>
                              <option value="easy">EASY</option>
                            </select>
                            <span className="priority-select-arrow">▾</span>
                          </div>
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
                        >×</button>
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
                      >✓</button>
                      <div className="flowzen-task-content">
                        <span className="flowzen-task-title done-title">{task.title}</span>
                      </div>
                      <button
                        className="flowzen-delete-btn"
                        onClick={() => handleDelete(task.id)}
                        aria-label="Delete task"
                      >×</button>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default ManageTasks;

class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  state = { hasError: false, error: "" };
  static getDerivedStateFromError(e: Error) {
    return { hasError: true, error: e.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, background: "#FFE9D7", borderRadius: 20, color: "#d97757", fontFamily: "sans-serif" }}>
          <strong>Flowzen Error:</strong> {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

mountWidget(
  <WidgetErrorBoundary>
    <ManageTasks />
  </WidgetErrorBoundary>
);
