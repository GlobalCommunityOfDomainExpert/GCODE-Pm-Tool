"use client";

import { useState } from "react";
import { BUILT_IN_ROLES } from "@/lib/auth/capabilityConstants";
import type { ScopeNode, TeamUser } from "./types";
import { ScopeSelect } from "./ScopeSelect";
import { Modal } from "../Modal";
import { Spinner } from "../Spinner";

const INPUT_CLASS =
  "rounded-md border border-border px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/15";

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
    <Modal
      onClose={onClose}
      title={`Edit ${user.name}`}
      subtitle="Update this teammate's role and scope."
      closeDisabled={loading}
      icon={
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      }
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading} className="rounded-sm px-4 py-2 text-[13px] text-text-secondary hover:bg-slate-100 disabled:opacity-50">
            Cancel
          </button>
          <button
            form="edit-user-form"
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 rounded-sm bg-primary px-5 py-2 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {loading && <Spinner />}
            {loading ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form id="edit-user-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Name</span>
            <input value={user.name} disabled className="rounded-md border border-border bg-app px-3 py-2.5 text-[13px] text-text-secondary" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Email</span>
            <input value={user.email || ""} disabled className="rounded-md border border-border bg-app px-3 py-2.5 text-[13px] text-text-secondary" />
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
                className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${roles.includes(r) ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary hover:bg-slate-50"}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Scope</span>
          <ScopeSelect tree={scopeTree} value={scope} onChange={setScope} className={INPUT_CLASS} />
        </label>
        {error && <div className="rounded-sm border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
