"use client";

import { useState } from "react";
import { BUILT_IN_ROLES } from "@/lib/auth/capabilityConstants";
import type { ScopeNode, TeamUser } from "./types";
import { ScopeSelect } from "./ScopeSelect";

export function EditUserModal({
  user,
  scopeTree,
  onClose,
  onSaved,
}: {
  user: TeamUser;
  scopeTree: ScopeNode[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roles, setRoles] = useState<string[]>(user.roles);
  const [scope, setScope] = useState(user.scope || "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleRole(role: string) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/team/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", roles, scope: scope || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong.");
        return;
      }
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-[480px] overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
        <div className="border-b border-border bg-gradient-to-br from-primary to-info px-6 py-4">
          <h2 className="text-base font-semibold text-white">Edit {user.name}</h2>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Name</span>
              <input value={user.name} disabled className="rounded-sm border border-border bg-app px-3 py-2 text-[13px] text-text-secondary" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Email</span>
              <input value={user.email || ""} disabled className="rounded-sm border border-border bg-app px-3 py-2 text-[13px] text-text-secondary" />
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Role(s)</span>
            <div className="flex flex-wrap gap-2">
              {BUILT_IN_ROLES.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => toggleRole(r)}
                  className={`rounded-full border px-3 py-1 text-[12px] font-medium ${roles.includes(r) ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary"}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Scope</span>
            <ScopeSelect tree={scopeTree} value={scope} onChange={setScope} className="rounded-sm border border-border px-3 py-2 text-[13px]" />
          </label>
          {error && <div className="rounded-sm border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">{error}</div>}
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-sm px-4 py-2 text-[13px] text-text-secondary hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="rounded-sm bg-primary px-5 py-2 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-60">
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
