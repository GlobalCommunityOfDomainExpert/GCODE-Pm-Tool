import { randomBytes, randomInt, createHash } from "crypto";

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

// Org-registration email OTP - short, typed by hand, so 6 digits (not
// randomToken's hex) and hashed at rest same as a magic-link token (see
// hashToken above): a DB read alone can't be replayed, only the code mailed
// to the recipient can. randomInt is rejection-sampled, so this is uniform
// over 000000-999999, not biased like `Math.random() % 1e6` would be.
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
