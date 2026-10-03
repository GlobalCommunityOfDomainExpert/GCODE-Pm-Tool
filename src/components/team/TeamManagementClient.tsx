"use client";

import { useCallback, useEffect, useState } from "react";
import { DirectoryTab } from "./DirectoryTab";
import { RoleDefinitionsTab } from "./RoleDefinitionsTab";
import { InviteCodesTab } from "./InviteCodesTab";
import { InviteUserModal } from "./InviteUserModal";
import type { InviteCode, ScopeNode, TeamUser } from "./types";
import { showActionError, showActionSuccess } from "../ActionToast";
import { apiFetch } from "@/lib/client/apiFetch";
import { useLiveRefresh } from "@/lib/client/useLiveRefresh";
import { flattenScopeTree } from "./types";

type Tab = "users" | "roles" | "invites";

export function TeamManagementClient({ currentUserId }: { currentUserId: string }) {
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [scopeTree, setScopeTree] = useState<ScopeNode[]>([]);
  const scopeOptions = flattenScopeTree(scopeTree);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [initialUsersLoad, setInitialUsersLoad] = useState(true);

  const loadUsers = useCallback(async (silent = false) => {
    if (!silent) setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (roleFilter) params.set("role", roleFilter);
      const res = await apiFetch(`/api/team/users?${params.toString()}`);
      if (res.ok) setUsers(await res.json());
    } finally {
      setUsersLoading(false);
      setInitialUsersLoad(false);
    }
  }, [search, roleFilter]);

  const loadCodes = useCallback(async () => {
    const res = await apiFetch("/api/team/invite-codes");
    if (res.ok) setCodes(await res.json());
  }, []);

  useEffect(() => {
    apiFetch("/api/team/scope-options")
      .then((r) => (r.ok ? r.json() : []))
      .then(setScopeTree);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // EN_008: someone else's invite/edit shows up on focus + every 30s, without a spinner.
  useLiveRefresh(() => loadUsers(true), { paused: inviteModalOpen });

  useEffect(() => {
    if (tab === "invites") loadCodes();
  }, [tab, loadCodes]);

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="mb-2 text-2xl font-semibold text-text-primary">Team Management</h1>
          <p className="text-[13px] text-text-secondary">Manage users, assign roles, and control how people join your organization.</p>
        </div>
        <div className="flex gap-3">
          <a href="/api/team/export" className="rounded-sm border border-border px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-slate-100">
            Export Team List
          </a>
          {tab === "users" && (
            <button onClick={() => setInviteModalOpen(true)} className="rounded-sm bg-primary px-4 py-2 text-[13px] font-medium text-white hover:bg-primary-hover">
              + Invite User
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 flex gap-6 border-b border-border">
        {([
          ["users", "Directory & Assignments"],
          ["roles", "Role Definitions"],
          ["invites", "Invite Codes"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`pb-3 text-[14px] font-semibold ${tab === key ? "border-b-2 border-primary text-primary" : "text-text-secondary"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <DirectoryTab
          users={users}
          currentUserId={currentUserId}
          scopeOptions={scopeOptions}
          scopeTree={scopeTree}
          search={search}
          onSearchChange={setSearch}
          roleFilter={roleFilter}
          onRoleFilterChange={setRoleFilter}
          loading={usersLoading}
          initialLoad={initialUsersLoad}
          onChanged={() => loadUsers()}
        />
      )}
      {tab === "roles" && <RoleDefinitionsTab />}
      {tab === "invites" && <InviteCodesTab codes={codes} scopeOptions={scopeOptions} scopeTree={scopeTree} onChanged={loadCodes} />}

      {inviteModalOpen && (
        <InviteUserModal
          scopeTree={scopeTree}
          onClose={() => setInviteModalOpen(false)}
          onCreated={(emailSent) => {
            setInviteModalOpen(false);
            if (emailSent) showActionSuccess("Invite email sent.");
            else showActionError("User created, but the invite email failed to send — resend from the row menu.");
            loadUsers();
          }}
        />
      )}
    </div>
  );
}
