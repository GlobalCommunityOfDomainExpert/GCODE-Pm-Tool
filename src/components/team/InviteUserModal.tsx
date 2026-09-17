"use client";

import { useState } from "react";
import { BUILT_IN_ROLES } from "@/lib/auth/capabilityConstants";
import type { ScopeOption } from "./types";

export function InviteUserModal({
  scopeOptions,
  onClose,
  onCreated,
}: {
  scopeOptions: ScopeOption[];
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-[480px] overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
        <div className="border-b border-border bg-gradient-to-br from-primary to-info px-6 py-4">
          <h2 className="text-base font-semibold text-white">+ New Team Member (Direct Invite)</h2>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-2 rounded-sm border border-border bg-app px-3 py-2 text-[12px] text-text-secondary">
            Sends a magic link — they click it, set a password, and their account is created with the role below. For
            a self-serve link anyone can use, generate an Invite Code instead (temp/guest access only).
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Alex Kim" className="rounded-sm border border-border px-3 py-2 text-[13px]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="alex@company.com" className="rounded-sm border border-border px-3 py-2 text-[13px]" />
          </label>
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
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-sm border border-border px-3 py-2 text-[13px]">
              <option value="">Whole Org</option>
              {scopeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {error && <div className="rounded-sm border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">{error}</div>}
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-sm px-4 py-2 text-[13px] text-text-secondary hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="rounded-sm bg-primary px-5 py-2 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-60">
              {loading ? "Sending…" : "Send Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
