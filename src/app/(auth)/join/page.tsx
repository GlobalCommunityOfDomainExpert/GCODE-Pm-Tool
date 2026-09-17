"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard, AuthField, AuthError, AuthButton } from "@/components/auth/AuthCard";

type LookupResult = { type: "temp" | null; roles?: string[]; scopeLabel?: string | null };

// Temp/guest codes only (FR-5) - a direct invite is a magic link and never
// lands here. One step: look up the code, then (if valid) join instantly.
export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/lookup-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data: LookupResult = await res.json();
      if (data.type !== "temp") {
        setError("That code is invalid, revoked, or fully used. Ask your admin for a new one.");
        return;
      }
      setLookup(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/join-with-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "That code is invalid, revoked, or fully used.");
        setLookup(null);
        return;
      }
      router.push("/workspaces");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (lookup?.type === "temp") {
    return (
      <AuthCard title="Join instantly" subtitle="This is a shared team code — no password or registration needed. Just tell us your name.">
        <div className="rounded-sm bg-success/10 px-3 py-2 text-[13px] text-success">
          You&apos;ll get <strong>{lookup.roles?.join(", ")}</strong> access
          {lookup.scopeLabel ? (
            <>
              {" "}
              scoped to <strong>{lookup.scopeLabel}</strong>.
            </>
          ) : (
            " across the whole org."
          )}
        </div>
        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <AuthField label="Full Name" placeholder="e.g. Alex Kim" value={name} onChange={(e) => setName(e.target.value)} required />
          <AuthField label="Email (optional)" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <p className="text-[11px] text-text-secondary">Add an email if you&apos;ll want to come back later — temp access without one is single-session only.</p>
          <AuthError message={error} />
          <AuthButton type="submit" disabled={loading}>
            {loading ? "Joining…" : "Join Workspace"}
          </AuthButton>
          <button type="button" onClick={() => setLookup(null)} className="text-[13px] text-text-secondary">
            ← Use a different code
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Join your team" subtitle="Enter the temp/guest code your admin gave you.">
      <form onSubmit={handleLookup} className="flex flex-col gap-4">
        <AuthField label="Invite Code" placeholder="e.g. ACME-4F2K" value={code} onChange={(e) => setCode(e.target.value)} required />
        <AuthError message={error} />
        <AuthButton type="submit" disabled={loading}>
          {loading ? "Checking…" : "Continue"}
        </AuthButton>
        <Link href="/login" className="text-[13px] text-text-secondary">
          Already joined? Sign in
        </Link>
      </form>
    </AuthCard>
  );
}
