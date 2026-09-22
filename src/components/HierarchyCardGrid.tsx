"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { HierarchyCardItem, HierarchyLevel } from "@/lib/types";
import { LEVEL_LABEL } from "@/lib/types";
import { Avatar, StatusBadge } from "./Badges";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { CreateItemModal } from "./CreateItemModal";
import { LEVEL_ICON_PATH } from "@/lib/levelIcons";

const LEVEL_ICON: Record<HierarchyLevel, { bg: string; fg: string; path: string }> = {
  workspace: { bg: "bg-indigo-100", fg: "text-indigo-700", path: LEVEL_ICON_PATH.workspace },
  initiative: { bg: "bg-fuchsia-100", fg: "text-fuchsia-700", path: LEVEL_ICON_PATH.initiative },
  program: { bg: "bg-sky-100", fg: "text-sky-700", path: LEVEL_ICON_PATH.program },
  project: { bg: "bg-amber-100", fg: "text-amber-700", path: LEVEL_ICON_PATH.project },
  task: { bg: "bg-slate-100", fg: "text-slate-500", path: LEVEL_ICON_PATH.task },
};

export function HierarchyCardGrid({
  items,
  onItemUpdated,
  onItemDeleted,
  level,
  childLevel,
  basePath,
}: {
  items: HierarchyCardItem[];
  onItemUpdated: (saved?: Record<string, unknown>) => void;
  onItemDeleted: (item: HierarchyCardItem) => Promise<void>;
  level: HierarchyLevel;
  childLevel: HierarchyLevel | null;
  basePath: string;
}) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HierarchyCardItem | null>(null);
  const [editTarget, setEditTarget] = useState<HierarchyCardItem | null>(null);

  useEffect(() => {
    if (!menuOpenId) return;
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-kebab-container]")) setMenuOpenId(null);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [menuOpenId]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center text-text-secondary">
        No items found at this level.
      </div>
    );
  }

  const icon = LEVEL_ICON[level];

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    // Parent owns items + treeItems together, so it does the optimistic
    // removal (both views) and the fetch/revert - this just hands off which
    // item and waits for the modal's own spinner.
    await onItemDeleted(target);
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {items.map((item) => (
        <div
          key={item.id}
          className="relative flex h-full flex-col rounded-lg border border-border bg-surface p-5 shadow-card transition-transform hover:-translate-y-0.5 hover:shadow-md"
        >
          <div data-kebab-container className="absolute right-3 top-3 z-20">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpenId(menuOpenId === item.id ? null : item.id);
              }}
              className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-slate-100"
              aria-label="Item actions"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>

            {menuOpenId === item.id && (
              <div className="absolute right-0 top-8 w-36 overflow-hidden rounded-md border border-border bg-white py-1 shadow-xl">
                <button
                  onClick={() => {
                    setMenuOpenId(null);
                    setEditTarget(item);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text-primary hover:bg-slate-100"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </button>
                <button
                  onClick={() => {
                    setMenuOpenId(null);
                    setDeleteTarget(item);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-danger hover:bg-danger/10"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z" />
                  </svg>
                  Delete
                </button>
              </div>
            )}
          </div>

          <Link href={`${basePath}/${item.id}`} className="flex h-full flex-col">
            <div className="mb-4 flex items-start justify-between pr-8">
              {item.logoData ? (
                // eslint-disable-next-line @next/next/no-img-element -- base64 data URL, not a static asset next/image can optimize
                <img src={item.logoData} alt="" className="h-10 w-10 rounded-md border border-border object-cover" />
              ) : (
                <div className={`flex h-10 w-10 items-center justify-center rounded-md text-lg ${icon.bg} ${icon.fg}`}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={icon.path} />
                  </svg>
                </div>
              )}
              {level === "project" || level === "task" ? <StatusBadge status={item.status || "On Track"} /> : null}
            </div>
            <h3 className="mb-1 text-base font-semibold text-text-primary">{item.name}</h3>
            <div className="mb-4 flex justify-between text-xs text-text-secondary">
              <span>
                {item.childCount} {childLevel ? LEVEL_LABEL[childLevel] : ""}
                {item.childCount === 1 ? "" : "s"}
              </span>
              <span className="flex items-center gap-1">
                <Avatar name={item.accountable?.name || null} /> {item.accountable?.name || "Unassigned"}
              </span>
            </div>
            <div className="mb-4 flex-1">
              <div className="mb-1.5 flex justify-between text-xs text-text-secondary">
                <span>Progress</span>
                <span className="font-semibold text-text-primary">{item.progress}%</span>
              </div>
              <div className="h-1 w-full rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-primary" style={{ width: `${item.progress}%` }} />
              </div>
              <div className="mt-3 text-[11px] text-text-secondary">
                {item.done}/{item.total} tasks
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3 text-xs font-semibold text-primary">
              <span>Enter {LEVEL_LABEL[level]}</span>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          </Link>
        </div>
      ))}

      {deleteTarget && (
        <ConfirmDeleteModal
          label={LEVEL_LABEL[level]}
          itemName={deleteTarget.name}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      {editTarget && (
        <CreateItemModal level={level} editItem={editTarget} onClose={() => setEditTarget(null)} onSaved={onItemUpdated} />
      )}
    </div>
  );
}
