/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Every hierarchy route is force-dynamic (src/app/(app)/workspaces/**),
    // but that only controls server rendering - the client Router Cache is a
    // separate layer that, by default, still reuses a visited dynamic
    // route's rendered output for a while. That's what made "create a
    // program, navigate away via breadcrumb, navigate back" show stale data
    // until a hard refresh: the client served the cached payload from the
    // first visit instead of asking the server again, so it never even hit
    // the server-side cache (unstable_cache/revalidateTag in lib/tree.ts)
    // that already had the fresh data. staleTimes.dynamic: 0 disables that
    // client-side reuse for dynamic routes specifically.
    staleTimes: {
      dynamic: 0,
    },
  },
};

// Security headers (EN_009 / D3). Passwords are protected in transit by TLS:
// HSTS makes browsers refuse plain http for the site after the first visit
// (ignored over http, so local dev is unaffected). Auth responses are never
// cached by browsers or shared proxies.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

nextConfig.headers = async () => [
  { source: "/:path*", headers: SECURITY_HEADERS },
  { source: "/api/auth/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
];

export default nextConfig;
