-- AlterTable
ALTER TABLE "Workspace" ALTER COLUMN "slug" SET NOT NULL;

-- AlterTable
ALTER TABLE "Initiative" ALTER COLUMN "slug" SET NOT NULL;

-- AlterTable
ALTER TABLE "Program" ALTER COLUMN "slug" SET NOT NULL;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_organizationId_slug_key" ON "Workspace"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Initiative_workspaceId_slug_key" ON "Initiative"("workspaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Program_initiativeId_slug_key" ON "Program"("initiativeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Project_programId_slug_key" ON "Project"("programId", "slug");
