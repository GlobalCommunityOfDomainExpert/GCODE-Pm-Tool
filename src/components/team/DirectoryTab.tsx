"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { ScopeNode, ScopeOption, TeamUser } from "./types";
import { EditUserModal } from "./EditUserModal";
import { reportIfActionFailed, showActionNotice } from "../ActionToast";
import { Spinner } from "../Spinner";

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

export function DirectoryTab({
  users,
  currentUserId,
  scopeOptions,
  scopeTree,
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  allRoles,
  loading,
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
  allRoles: string[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; right: number } | null>(null);
  const [editing, setEditing] = useState<TeamUser | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

  async function act(id: string, action: string) {
    if (action === "delete" && !confirm("Remove this teammate from the team?")) return;
    if (action === "suspend" && !confirm("Deactivate this user? They won't be able to sign in until reactivated.")) return;

    setBusy(id);
    setMenuFor(null);
    try {
      const res =
        action === "delete"
          ? await fetch(`/api/team/users/${id}`, { method: "DELETE" })
          : await fetch(`/api/team/users/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            });
      if (await reportIfActionFailed(res, "That didn't go through.")) return;
      showActionNotice(ACTION_NOTICE[action] || "Done.");
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  function scopeLabel(u: TeamUser) {
    if (!u.scope) return "Whole Org";
    const found = scopeOptions.find((o) => o.value === u.scope);
    return found?.label || "Whole Org";
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
          {allRoles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {loading && <Spinner className="h-4 w-4 shrink-0 text-text-secondary" />}
      </div>

      {users.length === 0 ? (
        <div className="p-12 text-center text-[13px] text-text-secondary">No teammates match this search.</div>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-app text-[11px] uppercase tracking-wide text-text-secondary">
              <th className="px-6 py-3 font-semibold">Team Member</th>
              <th className="px-6 py-3 font-semibold">Role</th>
              <th className="px-6 py-3 font-semibold">Scope</th>
              <th className="px-6 py-3 font-semibold">Joined Via</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 text-right font-semibold">Actions</th>
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
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <span key={r} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-[13px] text-text-secondary">{scopeLabel(u)}</td>
                  <td className={`px-6 py-3 text-[12px] ${src.color}`}>{src.text}</td>
                  <td className="px-6 py-3 text-[13px]">
                    <span className={STATUS_COLOR[u.status]}>● {u.status === "invited" ? "invited (pending)" : u.status}</span>
                  </td>
                  <td className="px-6 py-3 text-right">
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
