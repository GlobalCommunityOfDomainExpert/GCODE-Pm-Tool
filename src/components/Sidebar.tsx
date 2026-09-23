"use client";

import Image from "next/image";
import Logo from "public/logo-dark.png"
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [{ href: "/workspaces", label: "Workspaces", icon: "M4 6h16M4 12h16M4 18h7" }];

export function Sidebar({ canManageTeam }: { canManageTeam: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-sidebar shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-header items-center  gap-2 border-b border-border px-6">

      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        <div className="mb-6 px-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mx-0 flex items-center gap-3 rounded-md px-4 py-2.5 font-medium ${
                  active ? "bg-slate-100 text-primary" : "text-text-secondary hover:bg-slate-100"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Only rendered when the caller's role actually holds Manage Team Members -
            a UX courtesy, not the security boundary (the /team routes and every
            /api/team/* endpoint re-check this server-side regardless). */}
        {canManageTeam && (
          <div className="px-2">
            <div className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Admin</div>
            <Link
              href="/team"
              className={`mx-0 flex items-center gap-3 rounded-md px-4 py-2.5 font-medium ${
                pathname === "/team" || pathname.startsWith("/team/") ? "bg-slate-100 text-primary" : "text-text-secondary hover:bg-slate-100"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 2a4 4 0 00-3-3.87"
                />
              </svg>
              <span>Team Management</span>
            </Link>
          </div>
        )}
      </nav>
    </aside>
  );
}
