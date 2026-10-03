import { NextResponse } from "next/server";
import { getKeyPair } from "@/lib/auth/payloadCrypto";

// Reads the environment/process key, so it must never be prerendered.
export const dynamic = "force-dynamic";

// The public half of the credential-encryption key, plus the server's clock so the
// browser can stamp requests in server time (a skewed laptop clock would otherwise
// fail the 60s freshness window). Public by design - it only ever encrypts.
export async function GET() {
  try {
    const { kid, publicSpkiB64 } = getKeyPair();
    return NextResponse.json({ kid, publicKey: publicSpkiB64, alg: "RSA-OAEP-256+A256GCM", serverTime: Date.now() });
  } catch (err) {
    console.error("public-key unavailable:", (err as Error).message);
    return NextResponse.json({ error: "Encryption isn't configured on the server." }, { status: 503 });
  }
}
