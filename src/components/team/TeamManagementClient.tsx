"use client";

import { useCallback, useEffect, useState } from "react";
import { DirectoryTab } from "./DirectoryTab";
import { RoleDefinitionsTab } from "./RoleDefinitionsTab";
import { InviteCodesTab } from "./InviteCodesTab";
import { InviteUserModal } from "./InviteUserModal";
import type { CustomRole, InviteCode, ScopeNode, TeamUser } from "./types";
import { flattenScopeTree } from "./types";

type Tab = "users" | "roles" | "invites";

export function TeamManagementClient({ currentUserId }: { currentUserId: string }) {
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [scopeTree, setScopeTree] = useState<ScopeNode[]>([]);
  const scopeOptions = flattenScopeTree(scopeTree);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [initialUsersLoad, setInitialUsersLoad] = useState(true);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (roleFilter) params.set("role", roleFilter);
      const res = await fetch(`/api/team/users?${params.toString()}`);
      if (res.ok) setUsers(await res.json());
    } finally {
      setUsersLoading(false);
      setInitialUsersLoad(false);
    }
  }, [search, roleFilter]);

  const loadCodes = useCallback(async () => {
    const res = await fetch("/api/team/invite-codes");
    if (res.ok) setCodes(await res.json());
  }, []);

  const loadCustomRoles = useCallback(async () => {
    const res = await fetch("/api/team/custom-roles");
    if (res.ok) setCustomRoles(await res.json());
  }, []);

  useEffect(() => {
    fetch("/api/team/scope-options")
      .then((r) => r.json())
      .then(setScopeTree);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (tab === "invites") loadCodes();
    if (tab === "roles") loadCustomRoles();
  }, [tab, loadCodes, loadCustomRoles]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  const allRoles = Array.from(new Set(users.flatMap((u) => u.roles)));

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

      {toast && <div className="mb-4 rounded-sm border border-success/30 bg-success/5 px-3 py-2 text-[13px] text-success">{toast}</div>}

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
          allRoles={allRoles}
          loading={usersLoading}
          initialLoad={initialUsersLoad}
          onChanged={loadUsers}
        />
      )}
      {tab === "roles" && <RoleDefinitionsTab customRoles={customRoles} onChanged={loadCustomRoles} />}
      {tab === "invites" && <InviteCodesTab codes={codes} scopeOptions={scopeOptions} scopeTree={scopeTree} onChanged={loadCodes} />}

      {inviteModalOpen && (
        <InviteUserModal
          scopeTree={scopeTree}
          onClose={() => setInviteModalOpen(false)}
          onCreated={(emailSent) => {
            setInviteModalOpen(false);
            showToast(emailSent ? "Invite email sent." : "User created, but the invite email failed to send — resend from the row menu.");
            loadUsers();
          }}
        />
      )}
    </div>
  );
}
