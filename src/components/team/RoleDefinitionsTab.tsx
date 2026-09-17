"use client";

import { useState } from "react";
import { ALL_CAPABILITIES, BUILT_IN_ROLES, ROLE_CAPABILITY_MATRIX } from "@/lib/auth/capabilityConstants";
import type { CustomRole } from "./types";

export function RoleDefinitionsTab({ customRoles, onChanged }: { customRoles: CustomRole[]; onChanged: () => void }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  function toggle(cap: string) {
    setCapabilities((prev) => (prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/team/custom-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, capabilities }),
      });
      setCreating(false);
      setName("");
      setCapabilities([]);
      onChanged();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-text-primary">Role Permissions Matrix</h2>
        <p className="text-[13px] text-text-secondary">
          The live source of truth — every server-side permission check reads exactly this table (RoleCapability), not a static reference.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
        <table className="w-full min-w-[700px] border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-border bg-app">
              <th className="px-6 py-4 text-[11px] uppercase tracking-wide text-text-secondary">Capability</th>
              {BUILT_IN_ROLES.map((role) => (
                <th key={role} className="px-3 py-4 text-center text-[13px] font-semibold text-text-primary">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_CAPABILITIES.map((cap) => (
              <tr key={cap} className="border-b border-border last:border-0">
                <td className="px-6 py-3 text-[13px] font-medium text-text-primary">{cap}</td>
                {BUILT_IN_ROLES.map((role) => (
                  <td key={role} className="px-3 py-3 text-center">
                    {ROLE_CAPABILITY_MATRIX[role].includes(cap) ? (
                      <span className="text-success">✓</span>
                    ) : (
                      <span className="text-border">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-text-primary">Custom Roles</h3>
          {!creating && (
            <button onClick={() => setCreating(true)} className="rounded-sm bg-primary px-4 py-2 text-[13px] font-medium text-white hover:bg-primary-hover">
              + Create Custom Role
            </button>
          )}
        </div>

        {creating && (
          <form onSubmit={handleCreate} className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-card">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. QA Lead"
              className="rounded-sm border border-border px-3 py-2 text-[13px]"
            />
            <div className="flex flex-wrap gap-2">
              {ALL_CAPABILITIES.map((cap) => (
                <button
                  type="button"
                  key={cap}
                  onClick={() => toggle(cap)}
                  className={`rounded-full border px-3 py-1 text-[12px] font-medium ${capabilities.includes(cap) ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary"}`}
                >
                  {cap}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="rounded-sm px-4 py-2 text-[13px] text-text-secondary">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="rounded-sm bg-primary px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60">
                {loading ? "Creating…" : "Create Role"}
              </button>
            </div>
          </form>
        )}

        {customRoles.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-[13px] text-text-secondary">
            No custom roles yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {customRoles.map((r) => (
              <div key={r.id} className="rounded-md border border-border bg-surface p-3">
                <div className="text-[13px] font-semibold text-text-primary">{r.name}</div>
                <div className="mt-1 text-[12px] text-text-secondary">{r.capabilities.join(", ") || "No capabilities"}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
