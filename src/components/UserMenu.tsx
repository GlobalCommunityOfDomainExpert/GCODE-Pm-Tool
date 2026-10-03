"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client/apiFetch";
import { showActionError, showActionSuccess } from "./ActionToast";
import { Spinner } from "./Spinner";

export type OrgMembership = { userId: string; label: string; status: string; current: boolean };

function initialsOf(label: string) {
  return (
    label
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

// The account badge. With 2+ memberships it also lists the person's
// organizations (D8: invited/suspended ones are shown but disabled, with a
// label) and switches between them. A membership is labelled by the org name
// only when it is org-wide, otherwise by its scope - the same rule the header,
// emails and invite page follow.
export function UserMenu({ name, initials, memberships }: { name: string; initials: string; memberships: OrgMembership[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const canSwitch = memberships.length > 1;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function handleSwitch(m: OrgMembership) {
    if (m.current || m.status !== "active" || switchingTo) return;
    setSwitchingTo(m.userId);
    try {
      const res = await apiFetch("/api/auth/switch-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: m.userId }),
      });
      if (!res.ok) {
        if (res.status !== 401) {
          const data = await res.json().catch(() => ({}));
          showActionError(data.error || "Couldn't switch organization.");
        }
        return;
      }
      setOpen(false);
      // Slugs are per organization, so the current URL means nothing in the next one.
      router.push("/workspaces");
      router.refresh();
      showActionSuccess(`Switched to ${m.label}`);
    } finally {
      setSwitchingTo(null);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white"
        title={name}
        data-testid="account-badge"
      >
        {initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-20 mt-2 w-64 rounded-md border border-border bg-surface py-1 shadow-lg">
            <div className="truncate px-3 py-2 text-[13px] font-medium text-text-primary">{name}</div>

            {canSwitch && (
              <div data-testid="org-switcher" className="border-t border-border py-1">
                <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Switch organization</div>
                <div className="max-h-[260px] overflow-y-auto">
                  {memberships.map((m) => {
                    const disabled = m.status !== "active" && !m.current;
                    return (
                      <button
                        key={m.userId}
                        role="menuitem"
                        data-testid="org-option"
                        data-current={m.current ? "true" : "false"}
                        onClick={() => handleSwitch(m)}
                        disabled={disabled || !!switchingTo}
                        aria-current={m.current ? "true" : undefined}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-text-primary hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-200 text-[10px] font-semibold text-slate-600">
                          {initialsOf(m.label)}
                        </span>
                        <span className="min-w-0 flex-1 truncate" title={m.label}>
                          {m.label}
                          {m.status !== "active" && <span className="ml-1 text-[11px] text-text-secondary">({m.status})</span>}
                        </span>
                        {switchingTo === m.userId ? <Spinner className="h-3.5 w-3.5 text-text-secondary" /> : m.current ? <span className="text-primary">✓</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="border-t border-border">
              <button
                role="menuitem"
                onClick={handleLogout}
                disabled={loggingOut}
                className="block w-full px-3 py-2 text-left text-[13px] text-danger hover:bg-slate-100"
              >
                {loggingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
