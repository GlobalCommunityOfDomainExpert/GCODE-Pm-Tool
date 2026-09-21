import { redirect } from "next/navigation";
import { getSessionUserCached } from "@/lib/auth/session";
import { getCapabilitiesForRolesCached } from "@/lib/auth/capabilities";
import { findNodeLabelForScope } from "@/lib/auth/scopeLabel";
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
  if (!user) redirect("/login");

  const [capabilities, orgName, scopeLabel] = await Promise.all([
    getCapabilitiesForRolesCached(user.organizationId, user.roles),
    getOrgName(user.organizationId),
    user.scope ? findNodeLabelForScope(user.scope) : Promise.resolve(null),
  ]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar canManageTeam={capabilities.has("Manage Team Members")} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header userName={user.name} orgName={orgName} roles={user.roles} scopeLabel={scopeLabel} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-app p-6">
          <div className="mx-auto w-full max-w-content">{children}</div>
        </main>
      </div>
      <ActionToastHost />
    </div>
  );
}
