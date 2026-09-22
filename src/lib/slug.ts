// Turns a name into a URL segment: lowercase, non-alphanumeric runs collapsed
// to a single hyphen, no leading/trailing hyphen. Falls back to "item" for a
// name with no alphanumeric characters at all (emoji-only, etc.) so callers
// never have to handle an empty slug.
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "item";
}

// Appends -2, -3, ... until `exists` reports the candidate is free. `exists`
// is scoped by the caller (e.g. "is there already a sibling initiative under
// this workspace with this slug") - slugs are only unique within a parent,
// not globally, since the full URL path is what actually has to be unique.
export async function uniqueSlug(base: string, exists: (candidate: string) => Promise<boolean>): Promise<string> {
  let candidate = base;
  let n = 2;
  while (await exists(candidate)) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}
