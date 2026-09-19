"use client";

import { useState } from "react";
import { BUILT_IN_ROLES } from "@/lib/auth/capabilityConstants";
import type { ScopeNode } from "./types";
import { ScopeSelect } from "./ScopeSelect";
import { Modal } from "../Modal";
import { Spinner } from "../Spinner";

const INPUT_CLASS =
  "rounded-md border border-border px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/15";

export function InviteUserModal({
  scopeTree,
  onClose,
  onCreated,
}: {
  scopeTree: ScopeNode[];
  onClose: () => void;
  onCreated: (emailSent: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>(["Team Member"]);
  const [scope, setScope] = useState("");
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
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, roles, scope: scope || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      onCreated(data.emailSent);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title="Invite team member"
      subtitle="Sends a magic link to set a password and join with the role below."
      closeDisabled={loading}
      icon={
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6" />
        </svg>
      }
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading} className="rounded-sm px-4 py-2 text-[13px] text-text-secondary hover:bg-slate-100 disabled:opacity-50">
            Cancel
          </button>
          <button
            form="invite-user-form"
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 rounded-sm bg-primary px-5 py-2 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {loading && <Spinner />}
            {loading ? "Sending…" : "Send Invite"}
          </button>
        </>
      }
    >
      <form id="invite-user-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-start gap-2 rounded-sm border border-border bg-app px-3 py-2 text-[12px] text-text-secondary">
          For a self-serve link anyone can use instead, generate an Invite Code (temp/guest access only).
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Alex Kim" className={INPUT_CLASS} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="alex@company.com" className={INPUT_CLASS} />
        </label>
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
