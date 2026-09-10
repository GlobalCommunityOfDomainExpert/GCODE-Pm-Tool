"use client";

import Link from "next/link";
import { useState } from "react";
import type { HierarchyLevel, TreeNode } from "@/lib/types";
import { Avatar, PriorityBadge, StatusBadge } from "./Badges";

const LEVEL_BADGE_STYLE: Record<HierarchyLevel, string> = {
  workspace: "bg-slate-100 text-slate-600",
  initiative: "bg-amber-100 text-amber-700",
  program: "bg-purple-100 text-purple-700",
  project: "bg-sky-100 text-sky-700",
  task: "bg-emerald-100 text-emerald-700",
};

const LEVEL_TAG: Record<HierarchyLevel, string> = {
  workspace: "L1",
  initiative: "L2",
  program: "L3",
  project: "L4",
  task: "L5",
};

function LevelBadge({ level }: { level: HierarchyLevel }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${LEVEL_BADGE_STYLE[level]}`}>
      {LEVEL_TAG[level]}
    </span>
  );
}

function TreeRow({
  node,
  depth,
  basePath,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  basePath: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const rowPath = `${basePath}/${node.id}`;
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isTask = node.level === "task";

  return (
    <>
      <tr className="border-b border-slate-100 last:border-b-0 hover:bg-app">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3" style={{ paddingLeft: depth * 24 }}>
            {hasChildren ? (
              <button
                onClick={() => onToggle(node.id)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-slate-100"
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                </svg>
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}
            {isTask ? (
              <span className="text-[14px] font-medium text-text-primary">{node.name}</span>
            ) : (
              <Link href={rowPath} className="text-[14px] font-medium text-text-primary hover:text-primary">
                {node.name}
              </Link>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <LevelBadge level={node.level} />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 text-[13px]">
            <Avatar name={node.accountable?.name || null} />
            {node.accountable?.name || "Unassigned"}
          </div>
        </td>
        <td className="px-4 py-3">
          {node.level === "project" || node.level === "task" ? (
            <StatusBadge status={node.status} />
          ) : (
            <span className="text-text-secondary">-</span>
          )}
        </td>
        <td className="px-4 py-3">
          {node.priority ? <PriorityBadge priority={node.priority} /> : <span className="text-text-secondary">-</span>}
        </td>
        <td className="px-4 py-3 text-[13px] text-text-secondary">{node.dueDate || "-"}</td>
        <td className="w-[150px] px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-border">
              <div className="h-full rounded-full bg-success" style={{ width: `${node.progress}%` }} />
            </div>
            <span className="w-8 text-right text-xs text-text-secondary">{node.progress}%</span>
          </div>
        </td>
      </tr>
      {hasChildren &&
        isExpanded &&
        node.children.map((child) => (
          <TreeRow key={child.id} node={child} depth={depth + 1} basePath={rowPath} expanded={expanded} onToggle={onToggle} />
        ))}
    </>
  );
}

export function HierarchyTreeTable({ items, basePath }: { items: TreeNode[]; basePath: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center text-text-secondary">
        No items found at this level.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white shadow-card">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b-2 border-border bg-app text-[11px] uppercase tracking-wide text-text-secondary">
            <th className="px-4 py-3 font-semibold">Name</th>
            <th className="w-20 px-4 py-3 font-semibold">Level</th>
            <th className="w-[200px] px-4 py-3 font-semibold">Accountable</th>
            <th className="w-[120px] px-4 py-3 font-semibold">Status</th>
            <th className="w-[100px] px-4 py-3 font-semibold">Priority</th>
            <th className="w-[120px] px-4 py-3 font-semibold">Due Date</th>
            <th className="w-[150px] px-4 py-3 font-semibold">Progress</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <TreeRow key={item.id} node={item} depth={0} basePath={basePath} expanded={expanded} onToggle={toggle} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
