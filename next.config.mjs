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

export default nextConfig;
