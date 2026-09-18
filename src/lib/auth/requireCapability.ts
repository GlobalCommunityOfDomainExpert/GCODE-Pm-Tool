import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "./session";
import { getCapabilitiesForRoles, type Capability } from "./capabilities";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// The one gate every capability-guarded API route runs through. Resolves the
// caller from their server-side session (never the client-supplied body,
// headers, or a role the client claims to have) and 403s if the resulting
// capability set doesn't include what's requested. See docs/specifications/
// "Onboarding and Team Management v0.2 Spec.pdf" §7, Authorization model.
export async function requireCapability(capability: Capability): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Not signed in.");

  const caps = await getCapabilitiesForRoles(user.organizationId, user.roles);
  if (!caps.has(capability)) throw new ApiError(403, "You don't have permission to do that.");

  return user;
}

// Any signed-in user, no specific capability required (e.g. "view your own profile").
export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Not signed in.");
  return user;
}

type RouteHandler<Ctx> = (req: NextRequest, ctx: Ctx, user: SessionUser) => Promise<NextResponse>;

// Wraps a route handler so every response path - success, 401, 403, or an
// unexpected throw - is handled in one place instead of a try/catch per route.
export function withCapability<Ctx = unknown>(capability: Capability, handler: RouteHandler<Ctx>) {
  return async (req: NextRequest, ctx: Ctx): Promise<NextResponse> => {
    try {
      const user = await requireCapability(capability);
      return await handler(req, ctx, user);
    } catch (err) {
      if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      console.error(err);
      return NextResponse.json({ error: "Internal error." }, { status: 500 });
    }
  };
}

export function withSession<Ctx = unknown>(handler: RouteHandler<Ctx>) {
  return async (req: NextRequest, ctx: Ctx): Promise<NextResponse> => {
    try {
      const user = await requireSession();
      return await handler(req, ctx, user);
    } catch (err) {
      if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      console.error(err);
      return NextResponse.json({ error: "Internal error." }, { status: 500 });
    }
  };
}
