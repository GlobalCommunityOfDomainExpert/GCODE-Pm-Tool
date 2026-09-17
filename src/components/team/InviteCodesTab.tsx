"use client";

import { useState } from "react";
import { ROLE_CHOICES } from "@/lib/auth/capabilityConstants";
import type { InviteCode, ScopeOption } from "./types";

export function InviteCodesTab({
  codes,
  scopeOptions,
  onChanged,
}: {
  codes: InviteCode[];
  scopeOptions: ScopeOption[];
  onChanged: () => void;
}) {
  const [role, setRole] = useState<string>("Client");
  const [scope, setScope] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (role === "Client" && !scope) {
      setError('Pick a Scope for a Client code — "Whole Org" would give an outside client view of everything.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/team/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: [role], scope: scope || null, maxUses: maxUses ? Number(maxUses) : null, note: note || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setNote("");
      setMaxUses("");
      onChanged();
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this invite code? It will no longer work for new sign-ups.")) return;
    await fetch(`/api/team/invite-codes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke" }),
    });
    onChanged();
  }

  function copy(code: string) {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function scopeLabel(s: string | null) {
    if (!s) return "Whole Org";
    return scopeOptions.find((o) => o.value === s)?.label || "Whole Org";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-text-primary">Employee Invite Codes</h2>
        <p className="text-[13px] text-text-secondary">
          Temp/guest access only — a permanent employee always gets a Direct Invite (magic link) instead.
        </p>
      </div>

      <form onSubmit={handleGenerate} className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface p-5 shadow-card">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Role Granted</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-sm border border-border px-3 py-2 text-[13px]">
            {ROLE_CHOICES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Scope</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="min-w-[200px] rounded-sm border border-border px-3 py-2 text-[13px]">
            <option value="">Whole Org</option>
            {scopeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Max Uses</span>
          <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" className="w-[100px] rounded-sm border border-border px-3 py-2 text-[13px]" />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Engineering new-hires, Sept batch" className="rounded-sm border border-border px-3 py-2 text-[13px]" />
        </label>
        <button type="submit" disabled={loading} className="whitespace-nowrap rounded-sm bg-primary px-4 py-2 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-60">
          {loading ? "Generating…" : "Generate Code"}
        </button>
        {error && <div className="w-full rounded-sm border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">{error}</div>}
      </form>

      <div>
        <h3 className="mb-3 text-[15px] font-semibold text-text-primary">Generated Codes</h3>
        {codes.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-[13px] text-text-secondary">
            No invite codes yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {codes.map((c) => {
              const exhausted = c.maxUses != null && c.usesCount >= c.maxUses;
              const inactive = c.revoked || exhausted;
              return (
                <div key={c.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-3 ${inactive ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-3">
                    <code className="rounded-sm border border-border bg-app px-2.5 py-1 font-mono text-[13px] font-bold">{c.code}</code>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">{c.roles.join(", ")}</span>
                        <span className="rounded-full bg-app px-2 py-0.5 text-text-secondary">{scopeLabel(c.scope)}</span>
                        <span className="text-text-secondary">
                          {c.usesCount}
                          {c.maxUses != null ? ` / ${c.maxUses}` : ""} used
                        </span>
                        {c.revoked && <span className="font-semibold text-danger">Revoked</span>}
                        {!c.revoked && exhausted && <span className="font-semibold text-warning">Exhausted</span>}
                      </div>
                      {c.note && <div className="mt-0.5 text-[12px] text-text-secondary">{c.note}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => copy(c.code)} className="rounded-sm border border-border px-3 py-1.5 text-[12px] hover:bg-slate-100">
                      {copied === c.code ? "Copied" : "Copy"}
                    </button>
                    {!c.revoked && (
                      <button onClick={() => handleRevoke(c.id)} className="rounded-sm border border-border px-3 py-1.5 text-[12px] text-danger hover:bg-slate-100">
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
