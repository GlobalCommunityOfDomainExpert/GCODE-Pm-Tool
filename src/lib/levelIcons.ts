import type { HierarchyLevel } from "./types";

// Single source of truth for each level's icon glyph (path data only - color
// comes from wherever it's rendered, e.g. HierarchyCardGrid's card icon chip
// or Modal's tone prop) so the same L1-L5 glyph reads consistently everywhere
// it shows up.
export const LEVEL_ICON_PATH: Record<HierarchyLevel, string> = {
  workspace: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M15 9h.01M15 13h.01",
  initiative: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 100 12 6 6 0 000-12z",
  program: "M4 6h16M4 12h16M4 18h16",
  project: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  task: "M9 12l2 2 4-4",
};
