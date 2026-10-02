"use client";

import { useEffect, useState } from "react";

type Tone = "danger" | "info" | "success";
type ToastPayload = { message: string; tone: Tone };
type Toast = ToastPayload & { id: number };

const EVENT = "gcode:action-toast";
const MAX_VISIBLE = 4;
const HIDE_AFTER_MS: Record<Tone, number> = { success: 4000, info: 5000, danger: 7000 };

function dispatch(message: string, tone: Tone) {
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENT, { detail: { message, tone } }));
}

export function showActionError(message: string) {
  dispatch(message, "danger");
}

export function showActionNotice(message: string) {
  dispatch(message, "info");
}

export function showActionSuccess(message: string) {
  dispatch(message, "success");
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
  // 401 is handled by apiFetch (toast + redirect to /login) - don't stack a
  // second, contradictory error on top of it.
  if (res.status === 401) return true;
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

// One call for the whole write path: error toast + `false` on failure,
// success toast + `true` otherwise. Callers that need the response body must
// read it from a clone or before calling this only if they pass `res.clone()`;
// the common case (just "did it work?") needs nothing extra.
export async function mutate(res: Response, opts: { success: string; failure?: string }): Promise<boolean> {
  if (await reportIfActionFailed(res, opts.failure)) return false;
  showActionSuccess(opts.success);
  return true;
}

export function ActionToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let nextId = 1;
    const timers = new Map<number, ReturnType<typeof setTimeout>>();

    function remove(id: number) {
      clearTimeout(timers.get(id));
      timers.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }

    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastPayload>).detail;
      const id = nextId++;
      setToasts((prev) => [...prev, { ...detail, id }].slice(-MAX_VISIBLE));
      timers.set(id, setTimeout(() => remove(id), HIDE_AFTER_MS[detail.tone]));
    }

    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    // Always mounted so screen readers register the live region before the
    // first message arrives; role=alert on errors interrupts, status doesn't.
    <div aria-live="polite" className="pointer-events-none fixed bottom-6 right-6 z-[5000] flex flex-col items-end gap-2" data-testid="toast-region">
      {toasts.map((toast) => {
        const tone =
          toast.tone === "danger"
            ? "border-danger/30 bg-danger/10 text-danger"
            : toast.tone === "success"
              ? "border-success/30 bg-success/10 text-success"
              : "border-border bg-surface text-text-primary";
        return (
          <div
            key={toast.id}
            role={toast.tone === "danger" ? "alert" : "status"}
            data-tone={toast.tone}
            className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-md border px-4 py-3 text-[13px] font-medium shadow-xl ${tone}`}
          >
            {toast.tone === "danger" && <span aria-hidden>⚠</span>}
            {toast.tone === "success" && <span aria-hidden>✓</span>}
            <span>{toast.message}</span>
            <button onClick={() => dismiss(toast.id)} className="ml-1 text-current opacity-60 hover:opacity-100" aria-label="Dismiss">
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
