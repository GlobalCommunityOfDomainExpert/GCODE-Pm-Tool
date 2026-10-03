import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// App-layer protection for credential requests (EN_009, option 2 of D3).
//
// The browser encrypts the JSON body BEFORE sending (lib/client/envelope.ts), so the
// Network tab, request logs and any proxy see only opaque base64. Hybrid scheme,
// because RSA-OAEP alone only fits ~190 bytes and the register payload is bigger:
//   - a random AES-256-GCM key encrypts { ts, nonce, path, body }
//   - that AES key is wrapped with the server's RSA public key (OAEP, SHA-256)
//
// What this does NOT replace: TLS. It hides the password from anything that can read
// the wire or the request log, never from the user's own browser/JS - which already
// holds the password in the form field.
//
// Replay protection: every payload carries a one-time nonce (remembered in AuthNonce
// until it can no longer be fresh), a timestamp that must be within 60s of the
// server's clock, and the route it was built for, so a captured login ciphertext
// can't be replayed - not to /login again, nor to any other endpoint.

const MAX_AGE_MS = 60_000;

type KeyPair = { privateKey: crypto.KeyObject; publicSpkiB64: string; kid: string };
// On globalThis so Next's dev hot-reload doesn't regenerate the dev key on every edit.
const g = globalThis as unknown as { __gcodeAuthKey?: KeyPair };

function buildKeyPair(privateKey: crypto.KeyObject): KeyPair {
  const der = crypto.createPublicKey(privateKey).export({ type: "spki", format: "der" });
  return {
    privateKey,
    publicSpkiB64: der.toString("base64"),
    kid: crypto.createHash("sha256").update(der).digest("hex").slice(0, 16),
  };
}

// Production must set AUTH_RSA_PRIVATE_KEY (PKCS#8 PEM; literal "\n" is accepted so it fits one
// env line) - an ephemeral per-instance key would break across serverless instances. Dev
// generates one in memory.
export function getKeyPair(): KeyPair {
  if (g.__gcodeAuthKey) return g.__gcodeAuthKey;
  const pem = process.env.AUTH_RSA_PRIVATE_KEY;
  let privateKey: crypto.KeyObject;
  if (pem) {
    privateKey = crypto.createPrivateKey(pem.replace(/\\n/g, "\n"));
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_RSA_PRIVATE_KEY is not set");
  } else {
    privateKey = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  }
  g.__gcodeAuthKey = buildKeyPair(privateKey);
  return g.__gcodeAuthKey;
}

export class PayloadError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

type Envelope = { v: number; kid: string; key: string; iv: string; data: string };

function isEnvelope(e: unknown): e is Envelope {
  if (!e || typeof e !== "object") return false;
  const x = e as Record<string, unknown>;
  return x.v === 1 && ["kid", "key", "iv", "data"].every((k) => typeof x[k] === "string" && (x[k] as string).length > 0 && (x[k] as string).length < 100_000);
}

async function openEnvelope(raw: unknown, pathname: string): Promise<Record<string, unknown>> {
  if (!isEnvelope(raw)) throw new PayloadError("bad-envelope", "Malformed encrypted request.");
  const kp = getKeyPair();
  if (raw.kid !== kp.kid) throw new PayloadError("key-expired", "The encryption key changed. Please retry.");

  let plaintext: Buffer;
  try {
    const aesKey = crypto.privateDecrypt(
      { key: kp.privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      Buffer.from(raw.key, "base64")
    );
    if (aesKey.length !== 32) throw new Error("bad key length");
    const iv = Buffer.from(raw.iv, "base64");
    const data = Buffer.from(raw.data, "base64");
    if (iv.length !== 12 || data.length < 17) throw new Error("bad iv/data");
    const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
    decipher.setAuthTag(data.subarray(data.length - 16)); // WebCrypto appends the tag
    plaintext = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
  } catch {
    // Tampered, truncated, or encrypted to a different key: all the same to the caller.
    throw new PayloadError("bad-envelope", "Couldn't read the encrypted request.");
  }

  let payload: { ts?: unknown; nonce?: unknown; path?: unknown; body?: unknown };
  try {
    payload = JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new PayloadError("bad-envelope", "Couldn't read the encrypted request.");
  }
  if (typeof payload.ts !== "number" || typeof payload.nonce !== "string" || payload.nonce.length < 16 || payload.nonce.length > 128 || typeof payload.path !== "string") {
    throw new PayloadError("bad-envelope", "Malformed encrypted request.");
  }
  if (Math.abs(Date.now() - payload.ts) > MAX_AGE_MS) throw new PayloadError("stale", "That request expired. Please retry.");
  if (payload.path !== pathname) throw new PayloadError("wrong-route", "That request wasn't made for this endpoint.");
  if (!payload.body || typeof payload.body !== "object") throw new PayloadError("bad-envelope", "Malformed encrypted request.");

  // Burn the nonce LAST, so a request rejected above doesn't use one up. The primary key
  // makes a second use fail atomically even across instances.
  try {
    await prisma.authNonce.create({ data: { nonce: payload.nonce, expiresAt: new Date(Date.now() + MAX_AGE_MS * 2) } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") throw new PayloadError("replay", "That request was already used.");
    throw err;
  }
  // Housekeeping: expired nonces can never be replayed (their timestamp is stale anyway).
  if (Math.random() < 0.05) await prisma.authNonce.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});

  return payload.body as Record<string, unknown>;
}

function fail(status: number, code: string, message: string) {
  return { ok: false as const, response: NextResponse.json({ error: message, code }, { status }) };
}

// Drop-in for `await req.json().catch(() => null)` on credential routes.
//  - `{ enc: {...} }`  -> decrypted, replay/freshness/route checked, the inner body returned
//  - plain JSON        -> returned as-is (transition period), unless AUTH_REQUIRE_ENCRYPTED=true
export async function readAuthBody(req: NextRequest): Promise<{ ok: true; body: any } | { ok: false; response: NextResponse }> {
  const raw = await req.json().catch(() => null);
  const required = process.env.AUTH_REQUIRE_ENCRYPTED === "true";
  const isEncrypted = !!raw && typeof raw === "object" && "enc" in raw;

  if (!isEncrypted) {
    if (required) return fail(400, "encrypted-required", "This request must be encrypted. Please reload the page and try again.");
    return { ok: true, body: raw };
  }
  try {
    return { ok: true, body: await openEnvelope((raw as { enc: unknown }).enc, req.nextUrl.pathname) };
  } catch (err) {
    if (err instanceof PayloadError) return fail(400, err.code, err.message);
    throw err;
  }
}
