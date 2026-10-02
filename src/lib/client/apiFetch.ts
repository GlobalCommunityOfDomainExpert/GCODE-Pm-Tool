import { showActionError } from "@/components/ActionToast";

// fetch() for signed-in (app) pages. A 401 means the session was ended
// server-side (access changed, signed out elsewhere) - say so and send the
// person to /login instead of leaving every later action failing quietly.
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== "undefined") {
    showActionError("Your session ended. Please sign in again.");
    window.location.assign("/login?reason=access-changed");
  }
  return res;
}
