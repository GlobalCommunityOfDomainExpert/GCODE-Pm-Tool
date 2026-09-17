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

// Grouped by workspace (top level) so the Scope picker can render one
// <optgroup> per workspace with indented children, instead of a single flat
// list interleaving every workspace's initiatives/programs/projects.
export type ScopeNode = {
  value: string;
  label: string;
  kind: "workspace" | "initiative" | "program" | "project";
  children: ScopeNode[];
};

export function flattenScopeTree(tree: ScopeNode[]): ScopeOption[] {
  const out: ScopeOption[] = [];
  const walk = (nodes: ScopeNode[]) => {
    for (const n of nodes) {
      out.push({ value: n.value, label: `${n.label} (${n.kind})` });
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}
