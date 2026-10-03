"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client/apiFetch";
import { showActionSuccess } from "../ActionToast";
import type { ScopeNode, TeamUser } from "./types";
import { RoleAssignmentsEditor, assignmentsError, rowsKey, toPayload, type AssignmentRow } from "./RoleAssignmentsEditor";
import { Modal } from "../Modal";
import { Spinner } from "../Spinner";

// A user always has assignment rows after the R1 backfill; the legacy
// roles x scope fallback only covers a row the API returned without them.
function initialRows(user: TeamUser): AssignmentRow[] {
  if (user.roleAssignments?.length) return user.roleAssignments.map((a) => ({ role: a.role, scope: a.scope || "" }));
  return user.roles.map((role) => ({ role, scope: user.scope || "" }));
}

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
  const [initial] = useState(() => initialRows(user));
  const [rows, setRows] = useState<AssignmentRow[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const invalid = assignmentsError(rows);
  // EN_004: nothing to save until something actually differs.
  const changed = rowsKey(rows) !== rowsKey(initial);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid || !changed) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/team/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", assignments: toPayload(rows) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status !== 401) setError(data.error || "Something went wrong.");
        return;
      }
      showActionSuccess(
        data.signedOut
          ? `${user.name}'s access was updated. They've been signed out and will sign in again to use it.`
          : `${user.name} updated.`
      );
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={`Edit ${user.name}`}
      subtitle="Update this teammate's roles and where each one applies."
      closeDisabled={loading}
      maxWidth="600px"
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
            disabled={loading || !!invalid || !changed}
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
        <RoleAssignmentsEditor rows={rows} onChange={setRows} scopeTree={scopeTree} />
        <div className="flex items-start gap-2 rounded-sm border border-border bg-app px-3 py-2 text-[12px] text-text-secondary">
          Saving a change signs this person out so their new access applies.
        </div>
        {error && <div className="rounded-sm border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
