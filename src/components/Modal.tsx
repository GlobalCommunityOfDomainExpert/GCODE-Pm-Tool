"use client";

import { useEffect } from "react";

const TONE_CHIP: Record<"primary" | "danger", string> = {
  primary: "bg-primary/10 text-primary",
  danger: "bg-danger/10 text-danger",
};

// Shared dialog chrome (backdrop, panel, header, footer) for every centered
// modal in the app - one place for the SaaS-standard details (fade/scale-in,
// Escape-to-close, consistent icon+title header, sticky footer) instead of
// each modal hand-rolling its own.
export function Modal({
  onClose,
  title,
  subtitle,
  icon,
  tone = "primary",
  maxWidth = "480px",
  footer,
  closeDisabled,
  children,
}: {
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  tone?: "primary" | "danger";
  maxWidth?: string;
  footer?: React.ReactNode;
  closeDisabled?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !closeDisabled) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, closeDisabled]);

  return (
    <div
      className="animate-modal-backdrop fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={() => !closeDisabled && onClose()}
    >
      <div
        className="animate-modal-panel flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl border border-border bg-white shadow-xl ring-1 ring-black/5"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex items-start gap-3">
            {icon && (
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_CHIP[tone]}`}>
                {icon}
              </div>
            )}
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
              {subtitle && <p className="mt-0.5 text-[13px] text-text-secondary">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-slate-100 disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6">{children}</div>

        {footer && <div className="flex justify-end gap-3 border-t border-border bg-slate-50/60 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
