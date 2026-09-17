export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-8 shadow-card">
      <div className="mb-6 flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary" fill="currentColor">
          <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
        </svg>
        <span className="text-lg font-bold text-primary">Gcode</span>
      </div>
      <h1 className="mb-1 text-xl font-semibold text-text-primary">{title}</h1>
      {subtitle && <p className="mb-6 text-[13px] text-text-secondary">{subtitle}</p>}
      <div className="flex flex-col gap-4">{children}</div>
      {footer && <div className="mt-6 border-t border-border pt-4 text-center text-[13px]">{footer}</div>}
    </div>
  );
}

export function AuthField({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{label}</span>
      <input
        {...props}
        className="rounded-sm border border-border bg-white px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-primary"
      />
    </label>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-sm border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">{message}</div>;
}

export function AuthButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-sm bg-primary px-4 py-2.5 text-[13px] font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}
