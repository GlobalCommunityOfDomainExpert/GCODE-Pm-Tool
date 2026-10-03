// Browser half of credential encryption (see src/lib/auth/payloadCrypto.ts for the server
// half and the threat model). Pure WebCrypto - no DOM, no fetch - so the exact same code
// runs in the browser and in Node tests.

export type Envelope = { v: 1; kid: string; key: string; iv: string; data: string };

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Encrypts `body` for `path` with a fresh AES-256-GCM key, and wraps that key with the
// server's RSA public key (OAEP, SHA-256). `clockOffsetMs` = serverTime - Date.now(),
// so the timestamp is in server time even when this machine's clock is off.
export async function buildEnvelope(opts: {
  publicKeyB64: string;
  kid: string;
  path: string;
  body: unknown;
  clockOffsetMs?: number;
}): Promise<Envelope> {
  const subtle = globalThis.crypto.subtle;
  const rsa = await subtle.importKey("spki", fromB64(opts.publicKeyB64), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const aes = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const nonce = toB64(globalThis.crypto.getRandomValues(new Uint8Array(18)));

  const payload = JSON.stringify({ ts: Date.now() + (opts.clockOffsetMs ?? 0), nonce, path: opts.path, body: opts.body });
  const data = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(payload)));
  const wrapped = new Uint8Array(await subtle.encrypt({ name: "RSA-OAEP" }, rsa, await subtle.exportKey("raw", aes)));

  return { v: 1, kid: opts.kid, key: toB64(wrapped), iv: toB64(iv), data: toB64(data) };
}
