"use client";

import { useState } from "react";
import { AssigneeCombobox } from "./AssigneeCombobox";
import { reportIfActionFailed } from "./ActionToast";
import { Spinner } from "./Spinner";
import { Modal } from "./Modal";
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
import { LEVEL_ICON_PATH } from "@/lib/levelIcons";
import type { ScopeKind } from "@/lib/auth/scope";

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-white px-3 py-2.5 text-[13px] text-text-primary outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/15";

const CONTAINER_LEVELS: HierarchyLevel[] = ["workspace", "initiative", "program", "project"];

// Base64-in-the-row storage (no separate storage service - see
// prisma/schema.prisma's Workspace.logoData comment), so cap the raw file
// size client-side before it ever hits the request body.
const MAX_LOGO_BYTES = 400 * 1024;

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
  onSaved: (saved?: Record<string, unknown>) => void;
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
  const [logoData, setLogoData] = useState<string | null>(editItem?.logoData || null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be re-picked later (e.g. after Remove)
    if (!file) return;
    setLogoError(null);
    if (!file.type.startsWith("image/")) {
      setLogoError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Image is too large - please use one under 400KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoData(reader.result as string);
    reader.onerror = () => setLogoError("Couldn't read that file - please try again.");
    reader.readAsDataURL(file);
  }

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
        if (level === "workspace") body.logoData = logoData;

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
          if (level === "workspace") body.logoData = logoData;
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

      // Every POST/PATCH route here returns the created/updated row - hand it
      // to the caller so it can patch local state directly instead of
      // re-fetching the whole list/tree.
      const saved = await res.json().catch(() => undefined);
      onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEdit ? `Edit ${label}` : `New ${label}`}
      subtitle={isEdit ? undefined : `Add a ${label.toLowerCase()} to this ${isContainer ? "level" : "board"}.`}
      maxWidth="560px"
      closeDisabled={saving}
      icon={
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={LEVEL_ICON_PATH[level]} />
        </svg>
      }
      footer={
        <>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-sm px-4 py-2.5 text-[13px] font-medium text-text-secondary hover:bg-slate-100 disabled:opacity-50"
          >
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
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label={level === "task" ? "Title" : "Name"} span2>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`e.g. ${label} name`}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Description (optional)" span2>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={`${INPUT_CLASS} resize-y`}
          />
        </Field>

        {level === "workspace" && (
          <Field label="Client Logo (optional)" span2>
            <div className="flex items-center gap-3">
              {logoData ? (
                // Fixed height, width follows the logo's own aspect ratio
                // (capped) - matches how it'll actually render on the card
                // grid and page title, so this preview isn't misleading.
                <div className="flex h-12 max-w-[180px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL, not a static asset next/image can optimize */}
                  <img src={logoData} alt="" className="h-full w-full object-contain" />
                </div>
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-text-secondary">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={LEVEL_ICON_PATH.workspace} />
                  </svg>
                </div>
              )}
              <div className="flex flex-col items-start gap-1">
                <label className="cursor-pointer rounded-sm border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-slate-100">
                  {logoData ? "Replace" : "Upload"}
                  <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                </label>
                {logoData && (
                  <button type="button" onClick={() => setLogoData(null)} className="text-[12px] text-danger hover:underline">
                    Remove
                  </button>
                )}
              </div>
            </div>
            {logoError && <p className="mt-1.5 text-[12px] text-danger">{logoError}</p>}
          </Field>
        )}

        {isContainer && (
          <Field label="Accountable" span2={level !== "project"}>
            <AssigneeCombobox value={accountable} onChange={setAccountable} kind={assigneeKind} nodeId={assigneeNodeId} />
          </Field>
        )}

        {level === "project" && (
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={INPUT_CLASS}>
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
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={INPUT_CLASS}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={INPUT_CLASS}>
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
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={INPUT_CLASS} />
            </Field>
            <Field label="Due Date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={INPUT_CLASS} />
            </Field>
          </>
        )}
      </div>
    </Modal>
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
