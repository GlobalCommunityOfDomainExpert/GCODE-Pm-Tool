"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard, AuthField, AuthError, AuthButton } from "@/components/auth/AuthCard";

type InvitePreview = { name: string; email: string | null; roles: string[] };

// The magic-link landing page - the only route a direct-invite email links
// to. No code entry anywhere on this page (FR-6): the token in the URL is
// the credential, this page just validates it and collects a password.
export default function InvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/invite/${params.token}`)
      .then(async (res) => (res.ok ? setPreview(await res.json()) : setInvalid(true)))
      .catch(() => setInvalid(true));
  }, [params.token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/complete-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "That link was already used or is no longer valid.");
        return;
      }
      router.push("/workspaces");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (invalid) {
    return (
      <AuthCard title="Link no longer valid" subtitle="This invite link is invalid, expired, or was already used. Ask your admin to resend it.">
        <a href="/login" className="text-[13px] font-medium text-primary">← Back to sign in</a>
      </AuthCard>
    );
  }

  if (!preview) {
    return (
      <AuthCard title="Checking your invite…" subtitle="One moment.">
        <div />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Complete your registration" subtitle="You were personally invited. Set a password to finish creating your account.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthField label="Full Name" value={preview.name} disabled />
        <AuthField label="Work Email" value={preview.email || ""} disabled />
        <div className="flex flex-wrap gap-1.5">
          {preview.roles.map((r) => (
            <span key={r} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {r}
            </span>
          ))}
        </div>
        <AuthField label="Create Password" type="password" placeholder="Create a password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <AuthError message={error} />
        <AuthButton type="submit" disabled={loading}>
          {loading ? "Completing…" : "Complete Registration"}
        </AuthButton>
      </form>
    </AuthCard>
  );
}
