"use client";

import { useState } from "react";
import { AssigneeCombobox } from "./AssigneeCombobox";
import { reportIfActionFailed } from "./ActionToast";
import { Spinner } from "./Spinner";
import {
  CONTAINER_STATUSES,
  LEVEL_LABEL,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type HierarchyCardItem,
  type HierarchyLevel,
  type Assignee,
  type TaskItem,
} from "@/lib/types";
import { LEVEL_ENDPOINT as ENDPOINT } from "@/lib/endpoints";
import type { ScopeKind } from "@/lib/auth/scope";

const CONTAINER_LEVELS: HierarchyLevel[] = ["workspace", "initiative", "program", "project"];

const PARENT_FIELD: Record<HierarchyLevel, string | null> = {
  workspace: null,
  initiative: "workspaceId",
  program: "initiativeId",
  project: "programId",
  task: "projectId",
};

// The scope kind/id to filter the assignee picker against: the item's own
// (level, id) when editing an existing item, or its parent's (level, id)
// when creating one underneath it - see assignableUsersForNode in scope.ts,
// which this mirrors exactly. `kind: null` (new root Workspace, no parent)
// means "org-wide only" - handled by AssigneeCombobox/the API when nodeId is
// also null.
const PARENT_KIND: Record<HierarchyLevel, ScopeKind | null> = {
  workspace: null,
  initiative: "workspace",
  program: "initiative",
  project: "program",
  task: "project",
};

export function CreateItemModal({
  level,
  parentId,
  initialStatus,
  editTask,
  editItem,
  onClose,
  onSaved,
}: {
  level: HierarchyLevel;
  parentId?: string | null;
  initialStatus?: string;
  editTask?: TaskItem;
  editItem?: HierarchyCardItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editTask || !!editItem;
  const [name, setName] = useState(editTask?.title || editItem?.name || "");
  const [description, setDescription] = useState(editTask?.description || editItem?.description || "");
  const [accountable, setAccountable] = useState<Assignee | null>(editItem?.accountable || null);
  const [responsible, setResponsible] = useState<Assignee | null>(editTask?.responsible || null);
  const [status, setStatus] = useState(
    editTask?.status || editItem?.status || initialStatus || (level === "task" ? TASK_STATUSES[0] : CONTAINER_STATUSES[0])
  );
  const [priority, setPriority] = useState(editTask?.priority || TASK_PRIORITIES[1]);
  const [startDate, setStartDate] = useState(editTask?.startDate || "");
  const [dueDate, setDueDate] = useState(editTask?.dueDate || "");
  const [saving, setSaving] = useState(false);

  const isContainer = CONTAINER_LEVELS.includes(level);
  const label = LEVEL_LABEL[level];

  const assigneeKind: ScopeKind | null = level === "task" ? "project" : isEdit ? (level as ScopeKind) : PARENT_KIND[level];
  const assigneeNodeId: string | null = level === "task" ? parentId ?? null : isEdit ? editItem?.id ?? null : parentId ?? null;

  async function handleSave() {
    setSaving(true);
    try {
      let res: Response;
      if (editTask) {
        res = await fetch(`/api/tasks/${editTask.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: name,
            description,
            status,
            priority,
            responsibleId: responsible?.id || null,
            startDate: startDate || null,
            dueDate: dueDate || null,
          }),
        });
      } else if (editItem) {
        const body: Record<string, unknown> = {
          name,
          description: description || null,
          accountableId: accountable?.id || null,
        };
        if (level === "project") body.status = status;

        res = await fetch(`${ENDPOINT[level]}/${editItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        const body: Record<string, unknown> = {};
        const parentField = PARENT_FIELD[level];
        if (parentField && parentId) body[parentField] = parentId;

        if (isContainer) {
          body.name = name;
          body.description = description || null;
          body.accountableId = accountable?.id || null;
          if (level === "project") body.status = status;
        } else {
          body.title = name;
          body.description = description || null;
          body.status = status;
          body.priority = priority;
          body.responsibleId = responsible?.id || null;
          body.startDate = startDate || null;
          body.dueDate = dueDate || null;
        }

        res = await fetch(ENDPOINT[level], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      // A scope/permission failure closes and re-shows a modal that looks
      // saved, which is worse than leaving it open - so on failure, keep it
      // open (toast explains why) instead of calling onSaved()/onClose().
      if (await reportIfActionFailed(res, `Couldn't save this ${label.toLowerCase()}.`)) return;

      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-[520px] overflow-hidden rounded-lg border border-border bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[72px] items-center bg-gradient-to-br from-indigo-600 to-sky-500 px-6">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? `Edit ${label}` : `New ${label}`}
          </h2>
        </div>

        <div className="p-6">
          <div className="mb-6 grid grid-cols-2 gap-4">
            <Field label={level === "task" ? "Title" : "Name"} span2>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`e.g. ${label} name`}
                className="nfm-input"
              />
            </Field>

            <Field label="Description (optional)" span2>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="nfm-input resize-y"
              />
            </Field>

            {isContainer && (
              <Field label="Accountable" span2={level !== "project"}>
                <AssigneeCombobox value={accountable} onChange={setAccountable} kind={assigneeKind} nodeId={assigneeNodeId} />
              </Field>
            )}

            {level === "project" && (
              <Field label="Status">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="nfm-input">
                  {CONTAINER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {level === "task" && (
              <>
                <Field label="Status">
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="nfm-input">
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Priority">
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} className="nfm-input">
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Responsible">
                  <AssigneeCombobox value={responsible} onChange={setResponsible} kind={assigneeKind} nodeId={assigneeNodeId} />
                </Field>
                <Field label="Start Date (optional)">
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="nfm-input" />
                </Field>
                <Field label="Due Date">
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="nfm-input" />
                </Field>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="rounded-sm px-4 py-2.5 text-[13px] font-medium text-text-secondary hover:bg-slate-100">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="flex items-center gap-2 rounded-sm bg-primary px-5 py-2.5 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {saving && <Spinner />}
              {saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .nfm-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 13px;
          font-family: inherit;
          outline: none;
          background: white;
        }
      `}</style>
    </div>
  );
}

function Field({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactNode }) {
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{label}</label>
      {children}
    </div>
  );
}
