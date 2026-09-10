"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A2 2 0 004.18 21h15.64a2 2 0 001.87-2.96L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <h2 className="mb-1 text-lg font-semibold text-text-primary">Something went wrong</h2>
      <p className="mb-6 max-w-[420px] text-[13px] text-text-secondary">
        This item may have been deleted or changed elsewhere. Try again, or head back to your workspaces.
      </p>
      <div className="flex gap-3">
        <Link
          href="/workspaces"
          className="rounded-sm px-4 py-2.5 text-[13px] font-medium text-text-secondary hover:bg-slate-100"
        >
          Back to Workspaces
        </Link>
        <button
          onClick={reset}
          className="rounded-sm bg-primary px-5 py-2.5 text-[13px] font-medium text-white hover:bg-primary-hover"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
