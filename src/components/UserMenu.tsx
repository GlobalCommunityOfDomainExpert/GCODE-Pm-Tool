"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UserMenu({ name, initials }: { name: string; initials: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white"
        title={name}
      >
        {initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-48 rounded-md border border-border bg-surface py-1 shadow-lg">
            <div className="truncate px-3 py-2 text-[13px] font-medium text-text-primary">{name}</div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="block w-full px-3 py-2 text-left text-[13px] text-danger hover:bg-slate-100"
            >
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
