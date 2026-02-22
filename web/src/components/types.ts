export const PRIORITY_COLORS: Record<string, string> = {
  high: "#d97757",
  medium: "#6a9bcc",
  low: "#788c5d",
};

export const PRIORITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Med",
  low: "Low",
};

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: string;
  dueDate: string | null;
  createdAt: string;
}

export function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
