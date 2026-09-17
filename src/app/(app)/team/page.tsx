import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCapabilitiesForRoles } from "@/lib/auth/capabilities";
import { TeamManagementClient } from "@/components/team/TeamManagementClient";

// Defense-in-depth: (app)/layout.tsx already redirects an unauthenticated
// caller to /login and hides this page's Sidebar link for a role without the
// capability, but neither of those stops someone from typing /team into the
// address bar directly - this is the actual server-side gate for the page
// itself. Every fetch the client component below makes is independently
// gated again by the /api/team/* route handlers (FR-16/17).
export default async function TeamPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const capabilities = await getCapabilitiesForRoles(user.organizationId, user.roles);
  if (!capabilities.has("Manage Team Members")) redirect("/workspaces");

  return <TeamManagementClient currentUserId={user.id} />;
}
