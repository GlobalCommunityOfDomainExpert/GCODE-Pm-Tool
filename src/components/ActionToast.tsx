"use client";

import { useEffect, useState } from "react";

type Tone = "danger" | "info";
type ToastPayload = { message: string; tone: Tone };

const EVENT = "gcode:action-toast";

function dispatch(message: string, tone: Tone) {
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENT, { detail: { message, tone } }));
}

export function showActionError(message: string) {
  dispatch(message, "danger");
}

export function showActionNotice(message: string) {
  dispatch(message, "info");
}

// Every write in the app goes through withCapability/withSession, which
// already turns a scope/permission failure into a clear server message
// (e.g. "This task is outside your scope."). The one thing missing was any
// UI surfacing it - several call sites just fired the fetch and assumed it
// worked. Callers pass their Response here right after the fetch; on a
// non-2xx it raises this toast and returns true so the caller can bail out
// (skip the optimistic update / keep the modal open) instead of silently
// treating a failed write as a success.
export async function reportIfActionFailed(res: Response, fallback = "That didn't save. Please try again."): Promise<boolean> {
  if (res.ok) return false;
  let message = fallback;
  try {
    const data = await res.json();
    if (data?.error) message = data.error;
  } catch {
    // Non-JSON error body - fall back to the generic message.
  }
  showActionError(res.status === 403 ? `Action blocked: ${message}` : message);
  return true;
}

export function ActionToastHost() {
  const [toast, setToast] = useState<ToastPayload | null>(null);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout>;
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastPayload>).detail;
      setToast(detail);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setToast(null), 5000);
    }
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!toast) return null;

  const tone =
    toast.tone === "danger" ? "border-danger/30 bg-danger/10 text-danger" : "border-border bg-surface text-text-primary";

  return (
    <div className={`fixed bottom-6 right-6 z-[5000] flex max-w-sm items-start gap-2 rounded-md border px-4 py-3 text-[13px] font-medium shadow-xl ${tone}`}>
      {toast.tone === "danger" && <span aria-hidden>⚠</span>}
      <span>{toast.message}</span>
      <button onClick={() => setToast(null)} className="ml-1 text-current opacity-60 hover:opacity-100" aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
