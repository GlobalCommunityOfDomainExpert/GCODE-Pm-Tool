import { buildEnvelope } from "./envelope";

type ServerKey = { kid: string; publicKey: string; offset: number };
let cached: (ServerKey & { at: number }) | null = null;
const KEY_TTL_MS = 5 * 60_000;

async function loadKey(force: boolean): Promise<ServerKey> {
  if (!force && cached && Date.now() - cached.at < KEY_TTL_MS) return cached;
  const res = await fetch("/api/auth/public-key", { cache: "no-store" });
  if (!res.ok) throw new Error("no key");
  const { kid, publicKey, serverTime } = await res.json();
  cached = { kid, publicKey, offset: serverTime - Date.now(), at: Date.now() };
  return cached;
}

async function postJson(path: string, payload: unknown): Promise<Response> {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

// POST for credential routes (login, register, invite, join): the body is encrypted in the
// browser first, so the Network tab and request logs only ever see ciphertext.
// If the server key changed or this clock drifted, the server says so and we retry ONCE with
// a fresh key. If encryption isn't possible here (no WebCrypto on a non-secure origin, or the
// server has no key configured) it falls back to the plain request - which the server rejects
// outright when AUTH_REQUIRE_ENCRYPTED=true, so enforcing it never silently downgrades.
export async function securePost(path: string, body: unknown): Promise<Response> {
  if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.subtle) return postJson(path, body);

  const attempt = async (force: boolean): Promise<Response | null> => {
    let key: ServerKey;
    try {
      key = await loadKey(force);
    } catch {
      return null;
    }
    const enc = await buildEnvelope({ publicKeyB64: key.publicKey, kid: key.kid, path, body, clockOffsetMs: key.offset });
    return postJson(path, { enc });
  };

  let res = await attempt(false);
  if (!res) return postJson(path, body);
  if (res.status === 400) {
    const code = await res.clone().json().then((j) => j?.code).catch(() => null);
    if (code === "key-expired" || code === "stale") {
      const retry = await attempt(true);
      if (retry) res = retry;
    }
  }
  return res;
}
