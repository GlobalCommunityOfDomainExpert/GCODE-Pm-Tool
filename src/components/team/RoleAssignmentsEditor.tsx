"use client";

import { BUILT_IN_ROLES } from "@/lib/auth/capabilityConstants";
import type { ScopeNode } from "./types";
import { ScopeSelect } from "./ScopeSelect";

// One role on one scope. scope "" = whole org. A person holds one row per
// role-on-scope, e.g. Program Manager on Workspace A + Team Member on
// Workspace B (permissions on a node = union of every row that covers it).
export type AssignmentRow = { role: string; scope: string };

const SELECT_CLASS =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/15";

// Admin is always whole-org (EN_013); the server rejects a scoped one with
// 400, this just stops the form offering it. Portfolio Manager may be scoped.
const ORG_WIDE_ROLES = ["Admin"];

export const NEW_ROW: AssignmentRow = { role: "Team Member", scope: "" };

// What actually gets sent: Admin's scope is forced to whole-org.
export function toPayload(rows: AssignmentRow[]): { role: string; scope: string | null }[] {
  return rows.map((r) => ({ role: r.role, scope: ORG_WIDE_ROLES.includes(r.role) ? null : r.scope || null }));
}

// Order-insensitive fingerprint, used to tell whether anything really changed.
export function rowsKey(rows: AssignmentRow[]): string {
  return toPayload(rows)
    .map((r) => `${r.role}@${r.scope ?? ""}`)
    .sort()
    .join("|");
}

// null = valid. Mirrors the server rules (at least one row, no duplicates).
export function assignmentsError(rows: AssignmentRow[]): string | null {
  if (rows.length === 0) return "Add at least one role.";
  const seen = new Set<string>();
  for (const p of toPayload(rows)) {
    const key = `${p.role}@${p.scope ?? ""}`;
    if (seen.has(key)) return `"${p.role}" is listed twice for the same scope.`;
    seen.add(key);
  }
  return null;
}

export function RoleAssignmentsEditor({
  rows,
  onChange,
  scopeTree,
}: {
  rows: AssignmentRow[];
  onChange: (rows: AssignmentRow[]) => void;
  scopeTree: ScopeNode[];
}) {
  const error = assignmentsError(rows);

  function update(i: number, patch: Partial<AssignmentRow>) {
    onChange(
      rows.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, ...patch };
        if (ORG_WIDE_ROLES.includes(next.role)) next.scope = "";
        return next;
      })
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="assignments-editor">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Access</span>
      {rows.map((row, i) => {
        const locked = ORG_WIDE_ROLES.includes(row.role);
        // A held role outside the built-in list (a legacy custom role) stays selectable so editing never drops it silently.
        const roleChoices = (BUILT_IN_ROLES as readonly string[]).includes(row.role) ? [...BUILT_IN_ROLES, "Client"] : [...BUILT_IN_ROLES, "Client", row.role];
        return (
          <div key={i} data-testid="assignment-row" className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-2">
            <select aria-label={`Role for access row ${i + 1}`} value={row.role} onChange={(e) => update(i, { role: e.target.value })} className={SELECT_CLASS}>
              {[...new Set(roleChoices)].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {locked ? (
              <div data-testid="scope-locked" className={`${SELECT_CLASS} bg-app text-text-secondary`}>
                Whole Org <span className="text-[11px]">(always, for Admin)</span>
              </div>
            ) : (
              <ScopeSelect
                tree={scopeTree}
                value={row.scope}
                onChange={(scope) => update(i, { scope })}
                className={SELECT_CLASS}
                label={`Scope for access row ${i + 1}`}
              />
            )}
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              disabled={rows.length === 1}
              aria-label={`Remove access row ${i + 1}`}
              title={rows.length === 1 ? "A person needs at least one role" : "Remove"}
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-slate-100 disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        );
      })}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => onChange([...rows, { ...NEW_ROW }])} className="text-[13px] font-medium text-primary hover:underline">
          + Add access
        </button>
        {error && (
          <span role="alert" data-testid="assignments-error" className="text-[12px] text-danger">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
