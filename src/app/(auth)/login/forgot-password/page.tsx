"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthCard, AuthField, AuthButton } from "@/components/auth/AuthCard";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" subtitle="If that email is on an account, we've sent a reset link. It works once and expires in 72 hours.">
        <Link href="/login" className="text-[13px] font-medium text-primary">
          ← Back to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot password?" subtitle="Enter the email on your account and we'll send a reset link.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthField label="Email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <AuthButton type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </AuthButton>
        <Link href="/login" className="text-[13px] text-text-secondary">
          ← Back to sign in
        </Link>
      </form>
    </AuthCard>
  );
}
