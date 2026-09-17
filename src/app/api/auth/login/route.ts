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

  const user = await prisma.user.findFirst({ where: { email } });

  if (!user) {
    return NextResponse.json({ error: "not-found" }, { status: 401 });
  }
  if (user.status === "suspended") {
    return NextResponse.json({ error: "suspended" }, { status: 403 });
  }
  if (user.status === "invited") {
    return NextResponse.json({ error: "pending" }, { status: 403 });
  }
  if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "not-found" }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ id: user.id, name: user.name, email: user.email, roles: user.roles });
}
