import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-text-secondary">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="mb-1 text-lg font-semibold text-text-primary">Not found</h2>
      <p className="mb-6 max-w-[420px] text-[13px] text-text-secondary">
        This item doesn&apos;t exist anymore &mdash; it may have been deleted.
      </p>
      <Link
        href="/workspaces"
        className="rounded-sm bg-primary px-5 py-2.5 text-[13px] font-medium text-white hover:bg-primary-hover"
      >
        Back to Workspaces
      </Link>
    </div>
  );
}
