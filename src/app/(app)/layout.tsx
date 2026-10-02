import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUserCached, SESSION_COOKIE } from "@/lib/auth/session";
import { getCapabilitiesForRolesCached } from "@/lib/auth/capabilities";
import { findNodeLabelForScope } from "@/lib/auth/scopeLabel";
import { isOrgWide, scopedScopes } from "@/lib/auth/access";
import { getOrgName } from "@/lib/auth/org";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { ActionToastHost } from "@/components/ActionToast";

// The actual auth guard for the whole authenticated app. This is a server
// component check against the DB-backed session (src/lib/auth/session.ts),
// not a client-side redirect - there's no route under (app) that renders
// without this running first, and nothing here can be skipped by disabling
// JS or editing client state.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUserCached();
  if (!user) {
    // A cookie that no longer resolves to a session means it was revoked or
    // expired server-side (e.g. an admin changed this person's access) -
    // explain that instead of dropping them on a bare login form.
    redirect(cookies().get(SESSION_COOKIE) ? "/login?reason=access-changed" : "/login");
  }

  // Org name only for org-wide people (Admin / no scope); scoped users see their scope only.
  const orgWide = isOrgWide(user);
  const [capabilities, orgName, scopeLabels] = await Promise.all([
    getCapabilitiesForRolesCached(user.organizationId, user.roles),
    orgWide ? getOrgName(user.organizationId) : Promise.resolve(null),
    Promise.all(scopedScopes(user).map((sc) => findNodeLabelForScope(sc))),
  ]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar canManageTeam={capabilities.has("Manage Team Members")} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header userName={user.name} orgName={orgName} roles={user.roles} scopeLabel={scopeLabels.filter(Boolean).join(", ") || null} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-app p-6">
          <div className="mx-auto w-full max-w-content">{children}</div>
        </main>
      </div>
      <ActionToastHost />
    </div>
  );
}
