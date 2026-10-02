-- R1 (expand) - Enhancement-Plan.pdf section 8. ADDITIVE ONLY: no DROP, TRUNCATE,
-- DELETE or column type change on any existing table. Legacy User.roles /
-- User.scope stay authoritative and untouched. Everything runs as one implicit
-- transaction; the assertion block at the end raises on any inconsistency,
-- which rolls the whole migration back.
--
-- Rollback (manual, only if ever needed - nothing here is read by old code):
--   ALTER TABLE "User" DROP COLUMN "accountId";
--   DROP TABLE "RoleAssignment"; DROP TABLE "ScopeChangeLog"; DROP TABLE "Account";

-- Snapshot row counts of the tables that must not change.
CREATE TEMP TABLE _r1_counts AS
SELECT 'User' AS t, count(*) AS n FROM "User"
UNION ALL SELECT 'Workspace', count(*) FROM "Workspace"
UNION ALL SELECT 'Initiative', count(*) FROM "Initiative"
UNION ALL SELECT 'Program', count(*) FROM "Program"
UNION ALL SELECT 'Project', count(*) FROM "Project"
UNION ALL SELECT 'Task', count(*) FROM "Task";

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeChangeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "oldRoles" TEXT[],
    "oldScope" TEXT,
    "newRoles" TEXT[],
    "newScope" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScopeChangeLog_pkey" PRIMARY KEY ("id")
);

-- AlterTable (nullable column only - existing rows untouched until backfill below)
ALTER TABLE "User" ADD COLUMN "accountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");
CREATE INDEX "RoleAssignment_userId_idx" ON "RoleAssignment"("userId");
CREATE UNIQUE INDEX "RoleAssignment_userId_role_scope_key" ON "RoleAssignment"("userId", "role", "scope");
-- Postgres treats NULLs as distinct, so the unique index above does not stop
-- duplicate (userId, role) rows for whole-org assignments. This partial index does.
CREATE UNIQUE INDEX "RoleAssignment_userId_role_unscoped_key" ON "RoleAssignment"("userId", "role") WHERE "scope" IS NULL;
CREATE INDEX "ScopeChangeLog_userId_idx" ON "ScopeChangeLog"("userId");

-- AddForeignKey
-- SET NULL: deleting an Account can never delete memberships or workspaces.
ALTER TABLE "User" ADD CONSTRAINT "User_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- CASCADE: RoleAssignment is derived data only.
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: one RoleAssignment per (user, role) on the user's current scope.
-- Copy, don't move; idempotent via NOT EXISTS; DISTINCT guards duplicate array entries.
INSERT INTO "RoleAssignment" ("id", "userId", "role", "scope")
SELECT DISTINCT 'ra_' || md5(u."id" || '|' || r || '|' || coalesce(u."scope", '')), u."id", r, u."scope"
FROM "User" u
CROSS JOIN LATERAL unnest(u."roles") AS r
WHERE NOT EXISTS (
  SELECT 1 FROM "RoleAssignment" ra
  WHERE ra."userId" = u."id" AND ra."role" = r AND ra."scope" IS NOT DISTINCT FROM u."scope"
);

-- Backfill 2: Accounts, grouped by lower-cased email. Only unambiguous emails:
-- a single password hash across every row that has one. Same-email rows with
-- DIFFERENT passwords are deliberately left unlinked (never merged unsafely).
-- Email-less guests and users with no password yet (invited) get no Account.
INSERT INTO "Account" ("id", "email", "passwordHash")
SELECT 'acc_' || md5(lower(u."email")), lower(u."email"), min(u."passwordHash")
FROM "User" u
WHERE u."email" IS NOT NULL AND u."passwordHash" IS NOT NULL
GROUP BY lower(u."email")
HAVING count(DISTINCT u."passwordHash") = 1
ON CONFLICT ("email") DO NOTHING;

UPDATE "User" u
SET "accountId" = a."id"
FROM "Account" a
WHERE u."accountId" IS NULL
  AND u."email" IS NOT NULL
  AND lower(u."email") = a."email"
  AND u."passwordHash" = a."passwordHash";

-- Self-check: any failure raises and rolls back the whole migration.
DO $$
DECLARE
  bad bigint;
  chg record;
BEGIN
  SELECT count(*) INTO bad FROM "User" u
  WHERE cardinality(u."roles") > 0
    AND NOT EXISTS (SELECT 1 FROM "RoleAssignment" ra WHERE ra."userId" = u."id");
  IF bad > 0 THEN RAISE EXCEPTION 'R1 assertion failed: % user(s) with roles have no RoleAssignment', bad; END IF;

  SELECT count(*) INTO bad FROM "RoleAssignment" ra
  WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = ra."userId");
  IF bad > 0 THEN RAISE EXCEPTION 'R1 assertion failed: % RoleAssignment row(s) point at a missing user', bad; END IF;

  -- Every legacy (user, role) pair must be represented, on the same scope.
  SELECT count(*) INTO bad FROM "User" u CROSS JOIN LATERAL unnest(u."roles") AS r
  WHERE NOT EXISTS (
    SELECT 1 FROM "RoleAssignment" ra
    WHERE ra."userId" = u."id" AND ra."role" = r AND ra."scope" IS NOT DISTINCT FROM u."scope"
  );
  IF bad > 0 THEN RAISE EXCEPTION 'R1 assertion failed: % legacy role(s) missing from RoleAssignment', bad; END IF;

  SELECT count(*) INTO bad FROM "User" u JOIN "Account" a ON a."id" = u."accountId"
  WHERE lower(u."email") IS DISTINCT FROM a."email" OR u."passwordHash" IS DISTINCT FROM a."passwordHash";
  IF bad > 0 THEN RAISE EXCEPTION 'R1 assertion failed: % user(s) linked to a mismatching Account', bad; END IF;

  FOR chg IN
    SELECT c.t, c.n AS before_n,
      CASE c.t
        WHEN 'User' THEN (SELECT count(*) FROM "User")
        WHEN 'Workspace' THEN (SELECT count(*) FROM "Workspace")
        WHEN 'Initiative' THEN (SELECT count(*) FROM "Initiative")
        WHEN 'Program' THEN (SELECT count(*) FROM "Program")
        WHEN 'Project' THEN (SELECT count(*) FROM "Project")
        WHEN 'Task' THEN (SELECT count(*) FROM "Task")
      END AS after_n
    FROM _r1_counts c
  LOOP
    IF chg.before_n <> chg.after_n THEN
      RAISE EXCEPTION 'R1 assertion failed: % row count changed % -> %', chg.t, chg.before_n, chg.after_n;
    END IF;
  END LOOP;
END $$;
