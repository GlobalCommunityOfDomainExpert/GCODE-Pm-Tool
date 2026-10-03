"use client";

import { useEffect, useRef } from "react";

// Keeps a view fresh without a manual reload (EN_008, D10): calls `refresh`
// when the tab regains focus / becomes visible again, and every `intervalMs`
// while it is visible. Skips entirely while `paused` (a modal is open, a drag
// is in flight) so a background refresh can never overwrite what someone is
// in the middle of doing. The cheap option the plan chose over SSE; swapping
// the transport later only means replacing this hook's body.
export function useLiveRefresh(refresh: () => void, { intervalMs = 30_000, paused = false }: { intervalMs?: number; paused?: boolean } = {}) {
  // Latest callback/paused without re-subscribing listeners on every render.
  const refreshRef = useRef(refresh);
  const pausedRef = useRef(paused);
  refreshRef.current = refresh;
  pausedRef.current = paused;

  useEffect(() => {
    function tick() {
      if (pausedRef.current || document.visibilityState !== "visible") return;
      refreshRef.current();
    }
    const timer = setInterval(tick, intervalMs);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [intervalMs]);
}
