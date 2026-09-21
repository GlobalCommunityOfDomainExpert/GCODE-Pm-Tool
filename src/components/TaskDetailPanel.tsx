"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TASK_STATUSES, type TaskItem } from "@/lib/types";
import { PriorityBadge, Avatar } from "./Badges";
import { reportIfActionFailed } from "./ActionToast";
import { Spinner } from "./Spinner";

const STATUS_COLOR: Record<string, string> = {
  "Not Started": "bg-slate-100 text-slate-600",
  "In Progress": "bg-blue-100 text-blue-700",
  "Review Pending": "bg-amber-100 text-amber-700",
  Paused: "bg-red-100 text-red-700",
  Completed: "bg-emerald-100 text-emerald-700",
  "Yet To Update": "bg-slate-100 text-slate-500",
};

export function TaskDetailPanel({
  task,
  onClose,
  onEdit,
  onUpdated,
}: {
  task: TaskItem;
  onClose: () => void;
  onEdit: () => void;
  onUpdated: (patch: Partial<TaskItem>) => void;
}) {
  const [status, setStatus] = useState(task.status);
  const [description, setDescription] = useState(task.description || "");
  const [savingDescription, setSavingDescription] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStatus(task.status);
    setDescription(task.description || "");
  }, [task]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function handleStatusChange(next: string) {
    const previous = status;
    setStatus(next);
    onUpdated({ status: next });
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (await reportIfActionFailed(res, "Couldn't change this task's status.")) {
        setStatus(previous);
        onUpdated({ status: previous });
      }
    } finally {
      setSavingStatus(false);
    }
  }

  const descriptionDirty = description !== (task.description || "");

  async function handleSaveDescription() {
    const previous = task.description || "";
    const next = description;
    onUpdated({ description: next });
    setSavingDescription(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: next }),
      });
      if (await reportIfActionFailed(res, "Couldn't save this description.")) {
        setDescription(previous);
        onUpdated({ description: previous });
      }
    } finally {
      setSavingDescription(false);
    }
  }

  const ticketCode = `TSK-${task.id.slice(-4).toUpperCase()}`;

  return createPortal(
    <div className="fixed inset-0 z-[4000]">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l border-border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={savingStatus}
              className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide disabled:opacity-60 ${STATUS_COLOR[status] || "bg-slate-100 text-slate-600"}`}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {savingStatus && <Spinner className="h-3.5 w-3.5 text-text-secondary" />}
            <span className="text-[12px] font-mono text-text-secondary">{ticketCode}</span>
          </div>
          <div className="flex items-center gap-1">
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-slate-100"
                aria-label="More actions"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-32 rounded-md border border-border bg-white py-1 shadow-card">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit();
                    }}
                    className="block w-full px-3 py-1.5 text-left text-[13px] text-text-primary hover:bg-slate-100"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-slate-100"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <h2 className="mb-5 text-xl font-semibold text-text-primary">{task.title}</h2>

          <div className="mb-6 grid grid-cols-2 gap-5 border-y border-border py-5">
            <DetailField label="Responsible">
              <div className="flex items-center gap-2">
                <Avatar name={task.responsible?.name || null} />
                <span className="text-[13px] text-text-primary">{task.responsible?.name || "Unassigned"}</span>
              </div>
            </DetailField>
            <DetailField label="Priority">
              <PriorityBadge priority={task.priority} />
            </DetailField>
            <DetailField label="Start Date">
              <span className="text-[13px] text-text-primary">{task.startDate || "Not set"}</span>
            </DetailField>
            <DetailField label="Due Date">
              <span className="text-[13px] text-text-primary">{task.dueDate || "No due date"}</span>
            </DetailField>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Description</label>
              {descriptionDirty && (
                <button
                  onClick={handleSaveDescription}
                  disabled={savingDescription}
                  className="rounded-sm bg-primary px-3 py-1 text-[12px] font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                >
                  {savingDescription ? "Saving…" : "Save"}
                </button>
              )}
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="No description yet."
              className="w-full resize-y rounded-md border border-border px-3 py-2 text-[13px] outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{label}</div>
      {children}
    </div>
  );
}
