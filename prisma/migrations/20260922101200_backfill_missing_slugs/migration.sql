-- Backfills slug for any row created before this feature existed (slug is
-- still nullable at this point in the migration sequence - the next
-- migration makes it NOT NULL + unique, which would fail on a database with
-- pre-existing rows without this step first). No-op wherever slug is
-- already set (a fresh database, or one already backfilled by hand).
--
-- Uses the row's own id as a uniqueness-guaranteeing suffix rather than
-- reproducing the app's collision-retry logic (base, base-2, base-3... -
-- see src/lib/slug.ts) in SQL: id is already globally unique, so appending
-- it trivially satisfies the per-parent unique constraint added next
-- without needing to reason about siblings at all. Every row created after
-- this migration gets a clean name-derived slug via the API - this
-- fallback only ever applies to legacy rows, once.
UPDATE "Workspace"
SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')) || '-' || substring(id, 1, 8)
WHERE slug IS NULL;

UPDATE "Initiative"
SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')) || '-' || substring(id, 1, 8)
WHERE slug IS NULL;

UPDATE "Program"
SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')) || '-' || substring(id, 1, 8)
WHERE slug IS NULL;

UPDATE "Project"
SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')) || '-' || substring(id, 1, 8)
WHERE slug IS NULL;
