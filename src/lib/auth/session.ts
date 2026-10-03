import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { randomToken } from "./tokens";
import { assignmentsOfUser, type Assignment } from "./assignments";

const COOKIE_NAME = "gcode_session";
export const SESSION_COOKIE = COOKIE_NAME;
// Which membership (organization) this browser last used - lets a login with
// several memberships open straight into it instead of asking every time.
export const LAST_ORG_COOKIE = "gcode_last_org";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type SessionUser = {
  id: string;
  organizationId: string;
  // The login identity this membership belongs to (null = standalone user / guest).
  accountId: string | null;
  name: string;
  email: string | null;
  // Union of every assigned role - display and coarse "holds this capability
  // somewhere" gates only. Per-node decisions go through access.ts canOnNode().
  roles: string[];
  // One entry per role-on-scope (RoleAssignment). scope null = whole org.
  assignments: Assignment[];
  status: string;
};

// Called only from Route Handlers / Server Actions (cookie mutation isn't
// allowed from a Server Component render). The cookie carries nothing but
// this opaque, server-generated id - role/scope are looked up fresh from
// `User` on every request that uses it, never embedded in the cookie itself.
export async function createSession(userId: string): Promise<void> {
  const id = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { id, userId, expiresAt } });

  cookies().set(COOKIE_NAME, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  const member = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
  if (member) {
    cookies().set(LAST_ORG_COOKIE, member.organizationId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
  }
}

// Safe to call from Server Components (read-only) and Route Handlers alike.
// Resolves the caller's role/scope from the DB every time - this is the only
// place in the app that's allowed to answer "who is this request from."
// NOT wrapped in React.cache: that API only works inside the React Server
// Component render tree, and this is also called from Route Handlers
// (src/lib/auth/requireCapability.ts), which run outside it - React.cache
// there throws "cache is not a function" at build/runtime since Next
// resolves a plain `react` build (no `cache` export) for route bundles.
export async function getSessionUser(): Promise<SessionUser | null> {
  const id = cookies().get(COOKIE_NAME)?.value;
  if (!id) return null;

  const session = await prisma.session.findUnique({
    where: { id },
    include: { user: { include: { roleAssignments: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status === "suspended") return null;

  const { user } = session;
  // Reads prefer RoleAssignment; legacy roles/scope are only a fallback for a
  // user that has no assignment rows (dual-write keeps the two in sync).
  const assignments = assignmentsOfUser(user);
  return {
    id: user.id,
    organizationId: user.organizationId,
    accountId: user.accountId,
    name: user.name,
    email: user.email,
    roles: [...new Set(assignments.map((a) => a.role))],
    assignments,
    status: user.status,
  };
}

// RSC-only per-request dedup: layout.tsx and the page it wraps both call
// getSessionUser once per render, so wrap it in React.cache HERE - never
// export this from the plain function above, since that one is also called
// from Route Handlers (requireCapability.ts), which run outside the React
// Server Component tree where React.cache isn't valid (see the note above).
// Only import getSessionUserCached from layout.tsx/page.tsx files.
export const getSessionUserCached = cache(getSessionUser);

// For pages under (app): the layout already redirects an unauthenticated visitor, but
// Next renders a layout and its page concurrently, so the page can still run in the
// instant a session is gone (e.g. mid org-switch). Redirect instead of throwing.
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUserCached();
  if (!user) redirect("/login");
  return user;
}

export async function destroySession(): Promise<void> {
  const id = cookies().get(COOKIE_NAME)?.value;
  if (id) {
    await prisma.session.updateMany({ where: { id }, data: { revokedAt: new Date() } });
  }
  cookies().delete(COOKIE_NAME);
}
