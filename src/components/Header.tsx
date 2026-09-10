export function Header() {
  return (
    <header className="flex h-header shrink-0 items-center border-b border-border bg-surface px-6">
      <div className="flex w-full items-center justify-between">
        <div className="flex w-[300px] items-center rounded-md border border-border bg-app px-3 py-1.5 text-text-secondary">
          <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
          </svg>
          <span className="text-sm">Search</span>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
          G
        </div>
      </div>
    </header>
  );
}
