const CONTAINER_STATUS_STYLE: Record<string, string> = {
  "On Track": "bg-emerald-100 text-emerald-800",
  "At Risk": "bg-red-100 text-red-800",
  "In Progress": "bg-indigo-100 text-indigo-700",
  "To Do": "bg-slate-100 text-slate-600",
};

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-text-secondary">-</span>;
  const cls = CONTAINER_STATUS_STYLE[status] || "bg-slate-100 text-slate-600";
  return <span className={`rounded px-2 py-1 text-[11px] font-medium ${cls}`}>{status}</span>;
}

const PRIORITY_STYLE: Record<string, string> = {
  High: "text-danger bg-danger/10",
  Medium: "text-warning bg-warning/10",
  Low: "text-text-secondary bg-slate-100",
};

export function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_STYLE[priority] || PRIORITY_STYLE.Low;
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{priority}</span>;
}

export function Avatar({ name }: { name: string | null }) {
  const initials = (name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-800"
      title={name || "Unassigned"}
    >
      {initials}
    </div>
  );
}
