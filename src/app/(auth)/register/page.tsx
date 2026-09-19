"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard, AuthField, AuthError, AuthButton } from "@/components/auth/AuthCard";

const RESEND_COOLDOWN_S = 30;

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "otp">("form");
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      setStep("otp");
      setResendCooldown(RESEND_COOLDOWN_S);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register-org/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      router.push("/workspaces");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register-org/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      setNotice("A new code is on its way.");
      setResendCooldown(RESEND_COOLDOWN_S);
    } finally {
      setLoading(false);
    }
  }

  if (step === "otp") {
    return (
      <AuthCard
        title="Verify your email"
        subtitle={`We sent a 6-digit code to ${email}. Enter it below to finish creating your organization.`}
        footer={
          <>
            Wrong email?{" "}
            <button
              type="button"
              onClick={() => {
                setStep("form");
                setOtp("");
                setError(null);
                setNotice(null);
              }}
              className="font-medium text-primary"
            >
              Start over
            </button>
          </>
        }
      >
        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <AuthField
            label="Verification Code"
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
          />
          {notice && <div className="rounded-sm border border-success/30 bg-success/5 px-3 py-2 text-[13px] text-success">{notice}</div>}
          <AuthError message={error} />
          <AuthButton type="submit" disabled={loading || otp.length !== 6}>
            {loading ? "Verifying…" : "Verify & Create Organization"}
          </AuthButton>
          <button
            type="button"
            onClick={handleResend}
            disabled={loading || resendCooldown > 0}
            className="text-center text-[13px] font-medium text-primary disabled:cursor-not-allowed disabled:text-text-secondary"
          >
            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Register your organization"
      subtitle="Create a workspace for your company and become its first Admin."
      footer={
        <>
          Already have an organization? <Link href="/login" className="font-medium text-primary">Sign in</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthField label="Organization Name" placeholder="e.g. Acme Corp" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
        <AuthField label="Your Full Name" placeholder="e.g. Jane Doe" value={name} onChange={(e) => setName(e.target.value)} required />
        <AuthField label="Work Email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <AuthField label="Password" type="password" placeholder="Create a password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <AuthError message={error} />
        <AuthButton type="submit" disabled={loading}>
          {loading ? "Sending code…" : "Create Organization"}
        </AuthButton>
      </form>
    </AuthCard>
  );
}
