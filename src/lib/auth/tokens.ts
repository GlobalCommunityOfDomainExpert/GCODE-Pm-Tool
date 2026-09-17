import { randomBytes, createHash } from "crypto";

// Cryptographically random, high-entropy - used for session ids and magic-link
// tokens. Never derived from anything client-suppliable.
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

// Magic-link tokens are hashed at rest (users.inviteTokenHash) so a DB read
// alone can't be replayed as a valid link - only the raw token mailed to the
// recipient can. Session ids are stored as-is (see src/lib/auth/session.ts
// for why: they're never displayed or logged, and hashing them would just
// mean hashing on every request for no added protection against DB reads,
// since the cookie itself - not the DB row - is the thing an attacker needs).
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// Employee invite codes (e.g. ACME-4F2K) are meant to be read aloud / copy-pasted
// out of band - low-entropy by design, rate-limited at lookup, temp/guest access
// only. Not comparable to a session or magic-link token; never hashed.
export function generateInviteCode(orgName: string): string {
  const prefix = (orgName.replace(/[^A-Za-z0-9]/g, "").slice(0, 5) || "GCODE").toUpperCase();
  const suffix = randomBytes(3).toString("hex").toUpperCase(); // 6 hex chars
  return `${prefix}-${suffix}`;
}
