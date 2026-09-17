export type TeamUser = {
  id: string;
  name: string;
  email: string | null;
  roles: string[];
  scope: string | null;
  status: "active" | "invited" | "suspended";
  source: "org-founder" | "admin-invite" | "invite-code";
  inviteCode: { code: string } | null;
  createdAt: string;
};

export type InviteCode = {
  id: string;
  code: string;
  roles: string[];
  scope: string | null;
  note: string | null;
  maxUses: number | null;
  usesCount: number;
  revoked: boolean;
  createdAt: string;
};

export type CustomRole = {
  id: string;
  name: string;
  capabilities: string[];
  createdAt: string;
};

export type ScopeOption = { value: string; label: string };
