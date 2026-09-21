import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { randomToken } from "./tokens";

const COOKIE_NAME = "gcode_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type SessionUser = {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  roles: string[];
  scope: string | null;
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
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status === "suspended") return null;

  const { user } = session;
  return {
    id: user.id,
    organizationId: user.organizationId,
    name: user.name,
    email: user.email,
    roles: user.roles,
    scope: user.scope,
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

export async function destroySession(): Promise<void> {
  const id = cookies().get(COOKIE_NAME)?.value;
  if (id) {
    await prisma.session.updateMany({ where: { id }, data: { revokedAt: new Date() } });
  }
  cookies().delete(COOKIE_NAME);
}
