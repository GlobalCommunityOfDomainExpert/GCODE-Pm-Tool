// HTTPS enforcement decision (EN_009 / D3), kept pure so it is unit-testable
// without a Next runtime. Credentials are protected in transit by TLS - not by
// app-layer encryption, which would only hide the password from intermediaries
// (never from the user's own dev tools) and can't replace TLS.
//
// The important detail: a non-GET over plain http is REJECTED, never redirected.
// A 30x for a POST means the browser already sent the body - password included -
// in the clear before it ever sees the redirect.
export type HttpsInput = {
  nodeEnv: string | undefined;
  host: string; // Host header, may include a port
  proto: string; // x-forwarded-proto, or the request URL's protocol without ":"
  method: string;
  pathname: string;
  search: string;
};

export type HttpsDecision = { action: "allow" } | { action: "redirect"; location: string } | { action: "reject" };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function httpsDecision(i: HttpsInput): HttpsDecision {
  if (i.nodeEnv !== "production") return { action: "allow" };
  if (i.proto.split(",")[0].trim().toLowerCase() === "https") return { action: "allow" };
  const hostname = i.host.replace(/:\d+$/, "").toLowerCase();
  if (LOCAL_HOSTS.has(hostname)) return { action: "allow" }; // `next start` on your own machine
  const method = i.method.toUpperCase();
  if (method === "GET" || method === "HEAD") {
    return { action: "redirect", location: `https://${i.host}${i.pathname}${i.search}` };
  }
  return { action: "reject" };
}
