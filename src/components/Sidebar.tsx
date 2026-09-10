import Link from "next/link";

const NAV_ITEMS = [
  { href: "/workspaces", label: "Workspaces", icon: "M4 6h16M4 12h16M4 18h7" },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-sidebar shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-header items-center gap-2 border-b border-border px-6">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary" fill="currentColor">
          <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
        </svg>
        <span className="text-lg font-bold text-primary">Gcode</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        <div className="mb-6 px-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="mx-0 flex items-center gap-3 rounded-md bg-slate-100 px-4 py-2.5 font-medium text-primary"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </aside>
  );
}
