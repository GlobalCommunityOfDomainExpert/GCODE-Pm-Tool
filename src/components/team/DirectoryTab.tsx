"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { BUILT_IN_ROLES } from "@/lib/auth/capabilityConstants";
import type { ScopeNode, ScopeOption, TeamUser } from "./types";
import { EditUserModal } from "./EditUserModal";
import { mutate } from "../ActionToast";
import { apiFetch } from "@/lib/client/apiFetch";
import { ConfirmActionModal } from "../ConfirmActionModal";
import { Spinner } from "../Spinner";
import { Skeleton } from "../Skeleton";

const SOURCE_LABEL: Record<TeamUser["source"], { text: string; color: string }> = {
  "org-founder": { text: "Org Founder", color: "text-purple-600" },
  "admin-invite": { text: "Direct Invite", color: "text-text-secondary" },
  "invite-code": { text: "Temp Code", color: "text-info" },
};

const STATUS_COLOR: Record<TeamUser["status"], string> = {
  active: "text-success",
  invited: "text-warning",
  suspended: "text-danger",
};

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function AccessCell({ access }: { access: { role: string; label: string }[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? access : access.slice(0, 2);
  const hidden = access.length - 2;
  return (
    <div data-testid="access-cell" className="flex max-w-[360px] flex-wrap items-center gap-1">
      {shown.map((a, i) => (
        <span
          key={i}
          title={`${a.role} - ${a.label}`}
          className="max-w-[170px] truncate rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
        >
          {a.role} <span className="text-primary/70">· {a.label}</span>
        </span>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-text-secondary hover:bg-slate-100"
        >
          {expanded ? "Show less" : `+${hidden}`}
        </button>
      )}
    </div>
  );
}

export function DirectoryTab({
  users,
  currentUserId,
  scopeOptions,
  scopeTree,
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  loading,
  initialLoad,
  onChanged,
}: {
  users: TeamUser[];
  currentUserId: string;
  scopeOptions: ScopeOption[];
  scopeTree: ScopeNode[];
  search: string;
  onSearchChange: (v: string) => void;
  roleFilter: string;
  onRoleFilterChange: (v: string) => void;
  loading: boolean;
  initialLoad?: boolean;
  onChanged: () => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; right: number } | null>(null);
  const [editing, setEditing] = useState<TeamUser | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; action: "delete" | "suspend"; name: string } | null>(null);

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    if (menuFor === id) {
      setMenuFor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuRect({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    setMenuFor(id);
  }

  const ACTION_NOTICE: Record<string, string> = {
    delete: "Teammate removed.",
    suspend: "Teammate deactivated.",
    activate: "Teammate reactivated.",
    resend: "Invite link resent.",
    reset: "Password reset link sent.",
  };

  // delete / suspend are destructive: ask first, in the app (EN_010), then run perform().
  function act(id: string, action: string) {
    if (action === "delete" || action === "suspend") {
      setMenuFor(null);
      setConfirming({ id, action, name: users.find((u) => u.id === id)?.name || "this teammate" });
      return;
    }
    return perform(id, action);
  }

  async function perform(id: string, action: string) {
    setBusy(id);
    setMenuFor(null);
    try {
      const res =
        action === "delete"
          ? await apiFetch(`/api/team/users/${id}`, { method: "DELETE" })
          : await apiFetch(`/api/team/users/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            });
      if (!(await mutate(res, { success: ACTION_NOTICE[action] || "Done.", failure: "That didn't go through." }))) return;
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  function scopeLabel(scope: string | null) {
    if (!scope) return "Whole Org";
    const found = scopeOptions.find((o) => o.value === scope);
    return found?.label || "Unknown scope";
  }

  // One chip per role-on-scope. The first two show inline, the rest sit behind
  // a "+N" toggle so a many-scope person doesn't blow the row up (EN_014).
  function accessOf(u: TeamUser) {
    const rows = u.roleAssignments?.length ? u.roleAssignments : u.roles.map((role) => ({ role, scope: u.scope }));
    return rows.map((r) => ({ role: r.role, label: scopeLabel(r.scope) }));
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search team by name or email…"
          className="w-[300px] rounded-sm border border-border bg-app px-3 py-1.5 text-[13px] outline-none"
        />
        <select value={roleFilter} onChange={(e) => onRoleFilterChange(e.target.value)} className="rounded-sm border border-border px-3 py-1.5 text-[13px]">
          <option value="">All Roles</option>
          {BUILT_IN_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {loading && <Spinner className="h-4 w-4 shrink-0 text-text-secondary" />}
      </div>

      {initialLoad ? (
        <div className="space-y-2 p-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-sm border border-border p-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="p-12 text-center text-[13px] text-text-secondary">No teammates match this search.</div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-app text-[11px] uppercase tracking-wide text-text-secondary">
              <th className="px-6 py-3 font-semibold">Team Member</th>
              <th className="px-6 py-3 font-semibold">Access</th>
              <th className="px-6 py-3 font-semibold">Joined Via</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="sticky right-0 bg-app px-6 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === currentUserId;
              const src = SOURCE_LABEL[u.source];
              return (
                <tr key={u.id} className={`border-b border-border last:border-0 transition-opacity ${busy === u.id ? "opacity-50" : ""}`}>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold text-white ${isMe ? "bg-primary" : "bg-warning"}`}>
                        {initials(u.name)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
                          {u.name}
                          {isMe && <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-600">You</span>}
                        </div>
                        <div className="text-[12px] text-text-secondary">{u.email || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <AccessCell access={accessOf(u)} />
                  </td>
                  <td className={`px-6 py-3 text-[12px] ${src.color}`}>{src.text}</td>
                  <td className="px-6 py-3 text-[13px]">
                    <span className={STATUS_COLOR[u.status]}>● {u.status === "invited" ? "invited (pending)" : u.status}</span>
                  </td>
                  <td className="sticky right-0 bg-surface px-6 py-3 text-right">
                    {busy === u.id ? (
                      <Spinner className="ml-auto h-4 w-4 text-text-secondary" />
                    ) : (
                      <button
                        onClick={(e) => openMenu(e, u.id)}
                        disabled={isMe}
                        className="rounded-sm px-2 py-1 text-text-secondary hover:bg-slate-100 disabled:opacity-30"
                      >
                        ⋮
                      </button>
                    )}
                    {menuFor === u.id &&
                      menuRect &&
                      createPortal(
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
                          <div
                            style={{ position: "fixed", top: menuRect.top, right: menuRect.right }}
                            className="z-50 w-44 rounded-md border border-border bg-surface py-1 text-left shadow-xl"
                          >
                            <button onClick={() => { setEditing(u); setMenuFor(null); }} className="block w-full px-3 py-2 text-[13px] hover:bg-slate-100">
                              Edit
                            </button>
                            {u.status === "invited" && (
                              <button onClick={() => act(u.id, "resend")} className="block w-full px-3 py-2 text-left text-[13px] text-primary hover:bg-slate-100">
                                Resend Link
                              </button>
                            )}
                            {u.status === "active" && (
                              <button onClick={() => act(u.id, "reset")} className="block w-full px-3 py-2 text-left text-[13px] text-primary hover:bg-slate-100">
                                Reset Password
                              </button>
                            )}
                            <button
                              onClick={() => act(u.id, u.status === "suspended" ? "activate" : "suspend")}
                              className={`block w-full px-3 py-2 text-left text-[13px] hover:bg-slate-100 ${u.status === "suspended" ? "text-success" : "text-warning"}`}
                            >
                              {u.status === "suspended" ? "Reactivate" : "Deactivate"}
                            </button>
                            <button onClick={() => act(u.id, "delete")} className="block w-full px-3 py-2 text-left text-[13px] text-danger hover:bg-slate-100">
                              Delete
                            </button>
                          </div>
                        </>,
                        document.body
                      )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {confirming && (
        <ConfirmActionModal
          title={confirming.action === "delete" ? "Remove teammate?" : "Deactivate user?"}
          message={
            confirming.action === "delete"
              ? `Remove ${confirming.name} from the team? This can't be undone.`
              : `Deactivate ${confirming.name}? They won't be able to sign in until reactivated.`
          }
          confirmLabel={confirming.action === "delete" ? "Remove" : "Deactivate"}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            const { id, action } = confirming;
            setConfirming(null);
            await perform(id, action);
          }}
        />
      )}

      {editing && (
        <EditUserModal
          user={editing}
          scopeTree={scopeTree}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
