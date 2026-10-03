"use client";

import { createContext, useContext } from "react";

type PermissionsValue = {
  userId: string;
  // Capabilities the user holds through ANY assignment. Coarse on purpose:
  // "does this role hold X somewhere" (e.g. show the Team link). Per-node
  // decisions use the `perms` stamped on each node (lib/auth/perms.ts).
  capabilities: string[];
  orgWide: boolean;
};

const PermissionsContext = createContext<PermissionsValue | null>(null);

// Keyed by userId at the call site so switching account/org remounts it and
// can never leak one membership's permissions into the next.
export function PermissionsProvider({ value, children }: { value: PermissionsValue; children: React.ReactNode }) {
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("usePermissions must be used inside <PermissionsProvider>");
  return ctx;
}

// UI courtesy only - the server re-checks every write.
export function useCan(capability: string): boolean {
  return usePermissions().capabilities.includes(capability);
}
