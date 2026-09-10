"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HierarchyCardItem, HierarchyLevel, TreeNode } from "@/lib/types";
import { LEVEL_LABEL } from "@/lib/types";
import { HierarchyCardGrid } from "./HierarchyCardGrid";
import { HierarchyTreeTable } from "./HierarchyTreeTable";
import { ViewToggle, type ViewMode } from "./ViewToggle";
import { CreateItemModal } from "./CreateItemModal";

export function HierarchyLevelClient({
  items,
  treeItems,
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
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>("cards");
  const [showModal, setShowModal] = useState(false);

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
        <HierarchyCardGrid items={items} level={level} childLevel={childLevel} basePath={basePath} />
      ) : (
        <HierarchyTreeTable items={treeItems} basePath={basePath} />
      )}

      {showModal && (
        <CreateItemModal
          level={level}
          parentId={parentId}
          onClose={() => setShowModal(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
