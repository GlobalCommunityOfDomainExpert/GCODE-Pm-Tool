-- Repoints Workspace/Initiative/Program/Project.accountableId and
-- Task.responsibleId from Person to User (real, RBAC-aware accounts), so
-- assignment can be restricted to actual org teammates with the right scope.
--
-- Data migration: best-effort remap each existing accountableId/responsibleId
-- (a Person.id) to a User in the SAME organization whose name matches
-- case-insensitively. No match (or no organization on the old row) -> NULL
-- ("Unassigned"), per product decision - there is no reliable way to invent a
-- User account for a freeform Person name.

-- DropForeignKey (old Person-targeted constraints)
ALTER TABLE "Workspace" DROP CONSTRAINT "Workspace_accountableId_fkey";
ALTER TABLE "Initiative" DROP CONSTRAINT "Initiative_accountableId_fkey";
ALTER TABLE "Program" DROP CONSTRAINT "Program_accountableId_fkey";
ALTER TABLE "Project" DROP CONSTRAINT "Project_accountableId_fkey";
ALTER TABLE "Task" DROP CONSTRAINT "Task_responsibleId_fkey";

-- Remap: Workspace carries organizationId directly.
UPDATE "Workspace" w
SET "accountableId" = (
  SELECT u.id FROM "User" u
  JOIN "Person" p ON p.id = w."accountableId"
  WHERE lower(u.name) = lower(p.name) AND u."organizationId" = w."organizationId"
  LIMIT 1
)
WHERE w."accountableId" IS NOT NULL;

-- Remap: Initiative -> Workspace for organizationId.
UPDATE "Initiative" i
SET "accountableId" = (
  SELECT u.id FROM "User" u
  JOIN "Person" p ON p.id = i."accountableId"
  JOIN "Workspace" w ON w.id = i."workspaceId"
  WHERE lower(u.name) = lower(p.name) AND u."organizationId" = w."organizationId"
  LIMIT 1
)
WHERE i."accountableId" IS NOT NULL;

-- Remap: Program -> Initiative -> Workspace for organizationId.
UPDATE "Program" pr
SET "accountableId" = (
  SELECT u.id FROM "User" u
  JOIN "Person" p ON p.id = pr."accountableId"
  JOIN "Initiative" i ON i.id = pr."initiativeId"
  JOIN "Workspace" w ON w.id = i."workspaceId"
  WHERE lower(u.name) = lower(p.name) AND u."organizationId" = w."organizationId"
  LIMIT 1
)
WHERE pr."accountableId" IS NOT NULL;

-- Remap: Project -> Program -> Initiative -> Workspace for organizationId.
UPDATE "Project" proj
SET "accountableId" = (
  SELECT u.id FROM "User" u
  JOIN "Person" p ON p.id = proj."accountableId"
  JOIN "Program" pr ON pr.id = proj."programId"
  JOIN "Initiative" i ON i.id = pr."initiativeId"
  JOIN "Workspace" w ON w.id = i."workspaceId"
  WHERE lower(u.name) = lower(p.name) AND u."organizationId" = w."organizationId"
  LIMIT 1
)
WHERE proj."accountableId" IS NOT NULL;

-- Remap: Task -> Project -> Program -> Initiative -> Workspace for organizationId.
UPDATE "Task" t
SET "responsibleId" = (
  SELECT u.id FROM "User" u
  JOIN "Person" p ON p.id = t."responsibleId"
  JOIN "Project" proj ON proj.id = t."projectId"
  JOIN "Program" pr ON pr.id = proj."programId"
  JOIN "Initiative" i ON i.id = pr."initiativeId"
  JOIN "Workspace" w ON w.id = i."workspaceId"
  WHERE lower(u.name) = lower(p.name) AND u."organizationId" = w."organizationId"
  LIMIT 1
)
WHERE t."responsibleId" IS NOT NULL;

-- AddForeignKey (new User-targeted constraints)
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_accountableId_fkey" FOREIGN KEY ("accountableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_accountableId_fkey" FOREIGN KEY ("accountableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Program" ADD CONSTRAINT "Program_accountableId_fkey" FOREIGN KEY ("accountableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_accountableId_fkey" FOREIGN KEY ("accountableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
