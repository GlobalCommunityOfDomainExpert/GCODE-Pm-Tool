import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findNodeLabelForScope } from "@/lib/auth/scopeLabel";

// Only ever resolves shared/temp codes (FR-5) - there is no personal branch,
// since a direct invite arrives as a magic link and never touches this screen.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const code = (body?.code || "").trim().toUpperCase();
  if (!code) return NextResponse.json({ type: null });

  const invite = await prisma.inviteCode.findFirst({
    where: { code, revoked: false },
  });

  if (!invite || (invite.maxUses != null && invite.usesCount >= invite.maxUses)) {
    return NextResponse.json({ type: null });
  }

  const scopeLabel = invite.scope ? await findNodeLabelForScope(invite.scope) : null;
  return NextResponse.json({ type: "temp", roles: invite.roles, scope: invite.scope, scopeLabel, note: invite.note });
}
