"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard, AuthField, AuthError, AuthButton } from "@/components/auth/AuthCard";

const LOGIN_ERROR_MESSAGE: Record<string, string> = {
  "not-found": "No account found for that email.",
  suspended: "This account has been deactivated by an admin. Contact your organization admin.",
  pending: "This account is still pending. Check your email for your invite link.",
};

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"org" | "employee">("org");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          LOGIN_ERROR_MESSAGE[data.error] ||
            (tab === "org"
              ? "No organization account found for that email. Register your organization instead."
              : "No account found for that email. Join with your invite code instead.")
        );
        return;
      }
      router.push("/workspaces");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title={tab === "org" ? "Sign in to your organization" : "Sign in to your workspace"}
      subtitle={tab === "org" ? "Admins and org owners sign in here." : "For team members invited to an organization."}
      footer={
        tab === "org" ? (
          <>
            New organization? <Link href="/register" className="font-medium text-primary">Register your company</Link>
          </>
        ) : (
          <>
            Not on a workspace yet? <Link href="/join" className="font-medium text-primary">Join with a code</Link>
          </>
        )
      }
    >
      <div className="flex rounded-sm border border-border p-0.5 text-[13px]">
        {(["org", "employee"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            className={`flex-1 rounded-sm py-1.5 font-medium ${tab === t ? "bg-primary text-white" : "text-text-secondary"}`}
          >
            {t === "org" ? "Organization" : "Employee"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthField label="Email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <div>
          <AuthField label="Password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Link href="/login/forgot-password" className="mt-1.5 inline-block text-[12px] text-primary">
            Forgot password?
          </Link>
        </div>
        <AuthError message={error} />
        <AuthButton type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign In"}
        </AuthButton>
      </form>
    </AuthCard>
  );
}
