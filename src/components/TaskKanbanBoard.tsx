"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { TASK_STATUSES, type TaskItem } from "@/lib/types";
import { PriorityBadge, Avatar } from "./Badges";
import { CreateItemModal } from "./CreateItemModal";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { ViewToggle, type ViewMode } from "./ViewToggle";
import { TaskListView } from "./TaskListView";

const COLUMN_COLOR: Record<string, string> = {
  "Not Started": "#64748b",
  "In Progress": "#3b82f6",
  "Review Pending": "#f59e0b",
  Paused: "#ef4444",
  Completed: "#10b981",
  "Yet To Update": "#94a3b8",
};

export function TaskKanbanBoard({ projectId, initialTasks }: { projectId: string; initialTasks: TaskItem[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [viewingTask, setViewingTask] = useState<TaskItem | null>(null);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [newTaskStatus, setNewTaskStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("cards");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const taskId = event.active.id as string;
    const newStatus = event.over?.id as string | undefined;
    if (!newStatus) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: task.status } : t)));
    }
  }

  function patchTask(id: string, patch: Partial<TaskItem>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setViewingTask((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }

  function refresh(updated: Partial<TaskItem> & { id?: string }) {
    if (editingTask) {
      setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? { ...t, ...updated, id: t.id } : t)));
    } else {
      // A brand-new task: cheapest correct refresh is a full refetch since we don't
      // get the created row back from CreateItemModal.
      fetch(`/api/tasks?projectId=${projectId}`)
        .then((r) => r.json())
        .then((rows) =>
          setTasks(
            rows.map((r: { id: string; title: string; status: string; priority: string; responsible: { id: string; name: string } | null; description: string | null; startDate: string | null; dueDate: string | null }) => ({
              id: r.id,
              title: r.title,
              status: r.status,
              priority: r.priority,
              responsible: r.responsible,
              description: r.description,
              startDate: r.startDate ? r.startDate.slice(0, 10) : null,
              dueDate: r.dueDate ? r.dueDate.slice(0, 10) : null,
            }))
          )
        );
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <ViewToggle mode={mode} onChange={setMode} cardsLabel="Board" />
      </div>

      {mode === "cards" ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex items-stretch gap-4 overflow-x-auto pb-4">
            {TASK_STATUSES.map((status) => (
              <Column
                key={status}
                status={status}
                tasks={tasks.filter((t) => t.status === status)}
                onAddTask={() => setNewTaskStatus(status)}
                onTaskClick={setViewingTask}
              />
            ))}
          </div>
        </DndContext>
      ) : (
        <TaskListView tasks={tasks} onTaskClick={setViewingTask} />
      )}

      {viewingTask && (
        <TaskDetailPanel
          task={viewingTask}
          onClose={() => setViewingTask(null)}
          onEdit={() => {
            setEditingTask(viewingTask);
            setViewingTask(null);
          }}
          onUpdated={(patch) => patchTask(viewingTask.id, patch)}
        />
      )}

      {(editingTask || newTaskStatus) && (
        <CreateItemModal
          level="task"
          parentId={projectId}
          initialStatus={newTaskStatus || undefined}
          editTask={editingTask || undefined}
          onClose={() => {
            setEditingTask(null);
            setNewTaskStatus(null);
          }}
          onSaved={() => refresh(editingTask || {})}
        />
      )}
    </div>
  );
}

function Column({
  status,
  tasks,
  onAddTask,
  onTaskClick,
}: {
  status: string;
  tasks: TaskItem[];
  onAddTask: () => void;
  onTaskClick: (t: TaskItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const color = COLUMN_COLOR[status] || "#64748b";

  return (
    <div className="flex w-[280px] shrink-0 flex-col rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-4 flex items-center justify-between border-b-2 pb-2" style={{ borderColor: color }}>
        <h4 className="text-[13px] uppercase tracking-wide text-text-secondary">{status}</h4>
        <span className="rounded-full bg-border px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto rounded-md transition-colors ${isOver ? "bg-blue-50" : ""}`}
        style={{ minHeight: 80 }}
      >
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
        ))}
        <button
          onClick={onAddTask}
          className="w-full py-2 text-center text-xs text-text-secondary hover:text-primary"
        >
          + Add Task
        </button>
      </div>
    </div>
  );
}

function TaskCard({ task, onClick }: { task: TaskItem; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 10 : undefined }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className="mb-3 cursor-grab rounded-md border border-border bg-white p-3 shadow-card"
    >
      <div className="mb-2 text-[13px] font-medium text-text-primary">{task.title}</div>
      <div className="flex items-center justify-between">
        <PriorityBadge priority={task.priority} />
        <Avatar name={task.responsible?.name || null} />
      </div>
    </div>
  );
}
