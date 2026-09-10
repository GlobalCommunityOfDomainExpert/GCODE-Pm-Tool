"use client";

import { TASK_STATUSES, type TaskItem } from "@/lib/types";
import { PriorityBadge, Avatar } from "./Badges";

export function TaskListView({ tasks, onTaskClick }: { tasks: TaskItem[]; onTaskClick: (t: TaskItem) => void }) {
  const groups = TASK_STATUSES.map((status) => ({ status, items: tasks.filter((t) => t.status === status) })).filter(
    (g) => g.items.length > 0
  );

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center text-text-secondary">
        No tasks at this level yet. Switch to Board view to add one.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white shadow-card">
      {groups.map((group) => (
        <div key={group.status}>
          <div className="border-b border-border bg-app px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            {group.status} ({group.items.length})
          </div>
          {group.items.map((task) => (
            <div
              key={task.id}
              onClick={() => onTaskClick(task)}
              className="flex cursor-pointer items-center gap-4 border-b border-border px-5 py-3 last:border-b-0 hover:bg-app"
            >
              <div className="min-w-0 flex-[2] truncate text-[13px] font-medium text-text-primary">{task.title}</div>
              <div className="flex-1">
                <PriorityBadge priority={task.priority} />
              </div>
              <div className="flex flex-1 items-center gap-2 text-xs text-text-secondary">
                <Avatar name={task.responsible?.name || null} />
                {task.responsible?.name || "Unassigned"}
              </div>
              <div className="w-[110px] shrink-0 text-xs text-text-secondary">{task.dueDate || "No due date"}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
