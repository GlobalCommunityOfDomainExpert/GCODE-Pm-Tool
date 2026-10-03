import { NextRequest, NextResponse } from "next/server";
import { httpsDecision } from "@/lib/https";

// Production only (httpsDecision allows everything else): send plain-http page
// loads to https, and refuse any request that would carry a body over http.
export function middleware(req: NextRequest) {
  const decision = httpsDecision({
    nodeEnv: process.env.NODE_ENV,
    host: req.headers.get("host") || req.nextUrl.host,
    proto: req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", ""),
    method: req.method,
    pathname: req.nextUrl.pathname,
    search: req.nextUrl.search,
  });
  if (decision.action === "redirect") return NextResponse.redirect(decision.location, 308);
  if (decision.action === "reject") {
    return NextResponse.json({ error: "HTTPS is required." }, { status: 400 });
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next's own static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
