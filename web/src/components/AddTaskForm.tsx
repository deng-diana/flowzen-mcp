import { useState } from "react";

interface AddTaskFormProps {
  onAdd: (title: string, priority: "low" | "medium" | "high", dueDate: string | null) => void;
}

const PRIORITIES = [
  { value: "high" as const, label: "High", color: "#d97757" },
  { value: "medium" as const, label: "Med", color: "#6a9bcc" },
  { value: "low" as const, label: "Low", color: "#788c5d" },
];

export function AddTaskForm({ onAdd }: AddTaskFormProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd(title.trim(), priority, null);
    setTitle("");
    setPriority("medium");
  };

  return (
    <div className="add-form">
      <input
        type="text"
        className="add-input"
        placeholder="What will you do next?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        autoComplete="off"
      />
      {title.trim() && (
        <div className="add-row">
          <div className="priority-chips">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                className={`priority-chip ${priority === p.value ? "active" : ""}`}
                style={priority === p.value ? { color: p.color, borderColor: p.color + "55", background: p.color + "11" } : {}}
                onClick={() => setPriority(p.value)}
                type="button"
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className="add-btn" onClick={handleSubmit}>
            Add ↵
          </button>
        </div>
      )}
    </div>
  );
}
