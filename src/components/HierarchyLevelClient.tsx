"use client";

import { useEffect, useState } from "react";
import type { Assignee, HierarchyCardItem, HierarchyLevel, TreeNode } from "@/lib/types";
import { LEVEL_LABEL } from "@/lib/types";
import { LEVEL_ENDPOINT } from "@/lib/endpoints";
import { HierarchyCardGrid } from "./HierarchyCardGrid";
import { HierarchyTreeTable } from "./HierarchyTreeTable";
import { ViewToggle, type ViewMode } from "./ViewToggle";
import { CreateItemModal } from "./CreateItemModal";
import { reportIfActionFailed } from "./ActionToast";

type SavedRow = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  accountable: Assignee | null;
};

function toCardItem(row: SavedRow): HierarchyCardItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    status: row.status ?? null,
    accountable: row.accountable ?? null,
    childCount: 0,
    progress: 0,
    done: 0,
    total: 0,
  };
}

function toTreeNode(row: SavedRow, level: HierarchyLevel): TreeNode {
  return {
    id: row.id,
    level,
    name: row.name,
    status: row.status ?? null,
    accountable: row.accountable ?? null,
    priority: null,
    dueDate: null,
    progress: 0,
    children: [],
  };
}

// Card view (items) and List/Tree view (treeItems) are two separate shapes
// fed by the same server data - both need to move in lockstep on every
// mutation, or the view you're not currently looking at goes stale until the
// next navigation (a deleted item still showing in List after a Card-view
// delete, etc). This component is the single place that owns both, so every
// create/update/delete patches both arrays together instead of one view's
// component patching only its own copy.
export function HierarchyLevelClient({
  items: initialItems,
  treeItems: initialTreeItems,
  level,
  childLevel,
  basePath,
  parentId,
}: {
  items: HierarchyCardItem[];
  treeItems: TreeNode[];
  level: HierarchyLevel;
  childLevel: HierarchyLevel | null;
  basePath: string;
  parentId: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [treeItems, setTreeItems] = useState(initialTreeItems);
  const [mode, setMode] = useState<ViewMode>("cards");
  const [showModal, setShowModal] = useState(false);

  // A real navigation (different level/parent) hands us brand-new arrays
  // from the server - resync local state to them instead of carrying stale
  // optimistic edits across pages.
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);
  useEffect(() => {
    setTreeItems(initialTreeItems);
  }, [initialTreeItems]);

  function handleCreated(saved?: Record<string, unknown>) {
    if (!saved) return;
    const row = saved as unknown as SavedRow;
    setItems((prev) => [...prev, toCardItem(row)]);
    setTreeItems((prev) => [...prev, toTreeNode(row, level)]);
  }

  function handleItemUpdated(saved?: Record<string, unknown>) {
    if (!saved) return;
    const row = saved as unknown as SavedRow;
    setItems((prev) =>
      prev.map((it) => (it.id === row.id ? { ...it, name: row.name, description: row.description, status: row.status, accountable: row.accountable } : it))
    );
    setTreeItems((prev) => (prev.map((n) => (n.id === row.id ? { ...n, name: row.name, status: row.status, accountable: row.accountable } : n))));
  }

  async function handleItemDeleted(item: HierarchyCardItem) {
    const itemsSnapshot = items;
    const treeSnapshot = treeItems;
    // Remove from both views right away - revert both together if the
    // request comes back non-2xx.
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    setTreeItems((prev) => prev.filter((n) => n.id !== item.id));
    const res = await fetch(`${LEVEL_ENDPOINT[level]}/${item.id}`, { method: "DELETE" });
    if (await reportIfActionFailed(res, `Couldn't delete this ${LEVEL_LABEL[level].toLowerCase()}.`)) {
      setItems(itemsSnapshot);
      setTreeItems(treeSnapshot);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <ViewToggle mode={mode} onChange={setMode} />
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-[13px] font-medium text-white hover:bg-primary-hover"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
          New {LEVEL_LABEL[level]}
        </button>
      </div>

      {mode === "cards" ? (
        <HierarchyCardGrid
          items={items}
          level={level}
          childLevel={childLevel}
          basePath={basePath}
          onItemUpdated={handleItemUpdated}
          onItemDeleted={handleItemDeleted}
        />
      ) : (
        <HierarchyTreeTable items={treeItems} basePath={basePath} />
      )}

      {showModal && (
        <CreateItemModal level={level} parentId={parentId} onClose={() => setShowModal(false)} onSaved={handleCreated} />
      )}
    </div>
  );
}
