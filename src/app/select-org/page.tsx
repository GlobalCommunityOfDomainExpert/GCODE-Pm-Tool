"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard, AuthError } from "@/components/auth/AuthCard";
import { Spinner } from "@/components/Spinner";
import type { OrgMembership } from "@/components/UserMenu";

// Where a login with several organizations and no remembered one lands. Unlike
// the other auth pages this one REQUIRES a session (the password already
// verified at /login), so it sits outside the (auth) group, whose layout
// bounces signed-in people straight into the app.
export default function SelectOrgPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<OrgMembership[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/memberships")
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const list: OrgMembership[] = await res.json();
        // Only one place to go (e.g. a bookmarked /select-org): don't make anyone pick.
        if (list.length <= 1) router.replace("/workspaces");
        else setMemberships(list);
      })
      .catch(() => setError("Couldn't load your organizations. Please try again."));
  }, [router]);

  async function open(m: OrgMembership) {
    if (opening) return;
    setError(null);
    setOpening(m.userId);
    try {
      const res = await fetch("/api/auth/switch-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: m.userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't open that organization.");
        return;
      }
      router.push("/workspaces");
      router.refresh();
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-[440px]">
        <AuthCard title="Choose an organization" subtitle="Your account belongs to more than one. You can switch any time from the account menu.">
          {!memberships && !error && (
            <div className="flex justify-center py-4">
              <Spinner className="h-5 w-5 text-text-secondary" />
            </div>
          )}
          <AuthError message={error} />
          <div data-testid="org-list" className="flex flex-col gap-2">
            {memberships?.map((m) => {
              const disabled = m.status !== "active";
              return (
                <button
                  key={m.userId}
                  data-testid="org-option"
                  onClick={() => open(m)}
                  disabled={disabled || !!opening}
                  className="flex items-center gap-3 rounded-md border border-border px-4 py-3 text-left text-[14px] font-medium text-text-primary hover:border-primary hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1 truncate" title={m.label}>
                    {m.label}
                    {disabled && <span className="ml-1.5 text-[12px] font-normal text-text-secondary">({m.status})</span>}
                  </span>
                  {opening === m.userId && <Spinner className="h-4 w-4 text-text-secondary" />}
                </button>
              );
            })}
          </div>
        </AuthCard>
      </div>
    </div>
  );
}
