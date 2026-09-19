// Shared by register-org's start/resend routes - kept out of route.ts itself
// since Next.js App Router route files may only export HTTP method handlers
// and its small route-segment-config set, not arbitrary constants.
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
