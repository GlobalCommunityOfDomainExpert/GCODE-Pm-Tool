import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = (body?.email || "").trim().toLowerCase();
  const password = body?.password || "";

  if (!email || !password) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  // Email is unique per-org (@@unique([organizationId, email])), not globally -
  // the same person can legitimately hold an account in more than one org with
  // the same email. findFirst-by-email-alone would grab an arbitrary one of
  // those rows and check the password against only that row, so a correct
  // password for org B would 401 as "not-found" if org A's row happened to be
  // the one Postgres returned first. Instead, check the password against every
  // matching row and log into whichever one actually verifies.
  const candidates = await prisma.user.findMany({ where: { email } });

  if (candidates.length === 0) {
    return NextResponse.json({ error: "not-found" }, { status: 401 });
  }

  let user: (typeof candidates)[number] | null = null;
  for (const candidate of candidates) {
    if (candidate.passwordHash && (await verifyPassword(password, candidate.passwordHash))) {
      user = candidate;
      break;
    }
  }

  if (!user) {
    // No row's password matched (an invited row has no password to match at
    // all yet). Still surface suspended/pending here rather than a flat
    // "not-found" - that status is what tells a real invited/suspended user
    // why they can't get in, and it isn't sensitive (no password was needed
    // to see it, same as before this fix). With same-email-multiple-orgs,
    // suspended takes priority over pending as the more actionable message.
    if (candidates.some((c) => c.status === "suspended")) {
      return NextResponse.json({ error: "suspended" }, { status: 403 });
    }
    if (candidates.some((c) => c.status === "invited")) {
      return NextResponse.json({ error: "pending" }, { status: 403 });
    }
    return NextResponse.json({ error: "not-found" }, { status: 401 });
  }
  if (user.status === "suspended") {
    return NextResponse.json({ error: "suspended" }, { status: 403 });
  }
  if (user.status === "invited") {
    return NextResponse.json({ error: "pending" }, { status: 403 });
  }

  await createSession(user.id);
  return NextResponse.json({ id: user.id, name: user.name, email: user.email, roles: user.roles });
}
