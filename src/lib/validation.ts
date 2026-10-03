import { ApiError } from "./auth/requireCapability";
import { NAME_MAX, DESCRIPTION_MAX } from "./limits";

// Server-side half of EN_002: the form's maxLength is only a convenience, so
// every create/edit route runs this on the request body. Only keys actually
// present are checked, so a PATCH touching one field isn't rejected for an
// unrelated one. Counts characters, not UTF-16 units, so emoji count as one.
export function assertTextLimits(body: unknown): void {
  if (!body || typeof body !== "object") return;
  const b = body as Record<string, unknown>;
  const len = (v: unknown) => (typeof v === "string" ? [...v].length : 0);
  for (const key of ["name", "title"] as const) {
    if (key in b && len(b[key]) > NAME_MAX) {
      throw new ApiError(400, `${key === "title" ? "Title" : "Name"} can be at most ${NAME_MAX} characters.`);
    }
  }
  if ("description" in b && len(b.description) > DESCRIPTION_MAX) {
    throw new ApiError(400, `Description can be at most ${DESCRIPTION_MAX} characters.`);
  }
}
