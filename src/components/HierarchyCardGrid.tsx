import Link from "next/link";
import type { HierarchyCardItem, HierarchyLevel } from "@/lib/types";
import { LEVEL_LABEL } from "@/lib/types";
import { Avatar, StatusBadge } from "./Badges";

const LEVEL_ICON: Record<HierarchyLevel, { bg: string; fg: string; path: string }> = {
  workspace: { bg: "bg-indigo-100", fg: "text-indigo-700", path: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M15 9h.01M15 13h.01" },
  initiative: { bg: "bg-fuchsia-100", fg: "text-fuchsia-700", path: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 100 12 6 6 0 000-12z" },
  program: { bg: "bg-sky-100", fg: "text-sky-700", path: "M4 6h16M4 12h16M4 18h16" },
  project: { bg: "bg-amber-100", fg: "text-amber-700", path: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" },
  task: { bg: "bg-slate-100", fg: "text-slate-500", path: "M9 12l2 2 4-4" },
};

export function HierarchyCardGrid({
  items,
  level,
  childLevel,
  basePath,
}: {
  items: HierarchyCardItem[];
  level: HierarchyLevel;
  childLevel: HierarchyLevel | null;
  basePath: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center text-text-secondary">
        No items found at this level.
      </div>
    );
  }

  const icon = LEVEL_ICON[level];

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`${basePath}/${item.id}`}
          className="flex h-full flex-col rounded-lg border border-border bg-surface p-5 shadow-card transition-transform hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="mb-4 flex items-start justify-between">
            <div className={`flex h-10 w-10 items-center justify-center rounded-md text-lg ${icon.bg} ${icon.fg}`}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={icon.path} />
              </svg>
            </div>
            <StatusBadge status={item.status || "On Track"} />
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
      ))}
    </div>
  );
}
