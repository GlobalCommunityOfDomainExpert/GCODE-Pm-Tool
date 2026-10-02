"use client";

import { ALL_CAPABILITIES, BUILT_IN_ROLES, ROLE_CAPABILITY_MATRIX } from "@/lib/auth/capabilityConstants";

// Built-in role matrix only. Custom roles can no longer be created (EN_012);
// the CustomRole table and capability resolution stay, so anyone already
// holding one keeps their permissions.
export function RoleDefinitionsTab() {
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
    </div>
  );
}
