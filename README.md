# Gcode Workspaces v0.1

Production implementation of `docs/specifications/Workspaces v0.1 Spec.pdf`: the
Workspace → Initiative → Program → Project → Task hierarchy, Card/Tree views,
task Kanban board with drag-and-drop, and the shared create/edit modal.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind + Prisma/Postgres + @dnd-kit.

## Setup

1. **Postgres** — point `DATABASE_URL` at any Postgres 14+ instance (local, Docker, or Supabase per the spec's feasibility note). Copy the example env:

   ```bash
   cp .env.example .env
   # edit .env if your DB isn't at postgresql://postgres:postgres@localhost:5432/gcode_workspaces
   ```

   Local Postgres via Docker, if you don't have one running:

   ```bash
   docker run --name gcode-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gcode_workspaces -p 5432:5432 -d postgres:16
   ```

2. **Install & migrate**

   ```bash
   npm install
   npx prisma migrate dev --name init
   npm run prisma:seed
   ```

3. **Run**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 — redirects to `/workspaces`.

## Routes

`/workspaces` → `/workspaces/[workspaceId]` → `.../[initiativeId]` → `.../[programId]` → `.../[projectId]` (Kanban), matching the spec's App Router structure exactly.

## Notes / deviations from the reference wireframe

- Tree (table) view lists only the current level's immediate children (matches FR-2's "same data" wording) rather than the wireframe's cross-level expand/collapse, since each level is now its own route.
- Task edit reuses `CreateItemModal` in an edit mode instead of a separate detail-drawer component, satisfying the nav-flow diagram's "click a card → detail" step without adding a second modal shape.
- Drag-and-drop uses `@dnd-kit/core` instead of native HTML5 DnD (wireframe) for accessibility and reliability.
- Everything the spec marks out of scope (metrics row, Discussions/Files tabs, split-view, RBAC, filter/search, other app areas) was intentionally not built.
