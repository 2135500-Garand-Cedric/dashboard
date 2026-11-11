BEGIN;
-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "projectId" INTEGER,
ADD COLUMN     "stageId" INTEGER;

-- AlterTable
ALTER TABLE "WorkActivity" ADD COLUMN     "projectId" INTEGER,
ALTER COLUMN "todoReference" DROP NOT NULL;

-- AlterTable
ALTER TABLE "WorkNote" ADD COLUMN     "projectId" INTEGER,
ALTER COLUMN "todoId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "WorkAttachment" ADD COLUMN     "projectId" INTEGER,
ALTER COLUMN "todoId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "WorkKeyDate" ADD COLUMN     "completedAt" TIMESTAMPTZ(3),
ADD COLUMN     "projectId" INTEGER,
ALTER COLUMN "todoId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "WorkProject" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "objective" TEXT,
    "summary" TEXT,
    "contextId" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "startDate" VARCHAR(10),
    "targetDate" VARCHAR(10),
    "completionSummary" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkProjectStage" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkProjectStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkProject_userId_archivedAt_status_idx" ON "WorkProject"("userId", "archivedAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkProject_id_userId_key" ON "WorkProject"("id", "userId");

-- CreateIndex
CREATE INDEX "WorkProjectStage_projectId_position_idx" ON "WorkProjectStage"("projectId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "WorkProjectStage_id_projectId_key" ON "WorkProjectStage"("id", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkProjectStage_projectId_name_key" ON "WorkProjectStage"("projectId", "name");

-- CreateIndex
CREATE INDEX "WorkActivity_userId_projectId_createdAt_idx" ON "WorkActivity"("userId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkNote_projectId_idx" ON "WorkNote"("projectId");

-- CreateIndex
CREATE INDEX "WorkAttachment_projectId_idx" ON "WorkAttachment"("projectId");

-- CreateIndex
CREATE INDEX "WorkKeyDate_projectId_idx" ON "WorkKeyDate"("projectId");

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "WorkProject"("id", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_stageId_projectId_fkey" FOREIGN KEY ("stageId", "projectId") REFERENCES "WorkProjectStage"("id", "projectId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkNote" ADD CONSTRAINT "WorkNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkKeyDate" ADD CONSTRAINT "WorkKeyDate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "WorkContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProjectStage" ADD CONSTRAINT "WorkProjectStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Todo" ADD CONSTRAINT "Todo_stage_requires_project" CHECK ("stageId" IS NULL OR "projectId" IS NOT NULL);
CREATE INDEX "Todo_projectId_stageId_idx" ON "Todo"("projectId", "stageId");
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_lifecycle" CHECK (
 ("status"='ACTIVE' AND "completedAt" IS NULL AND "cancelledAt" IS NULL) OR
 ("status"='COMPLETED' AND "completedAt" IS NOT NULL AND "cancelledAt" IS NULL) OR
 ("status"='CANCELLED' AND "completedAt" IS NULL AND "cancelledAt" IS NOT NULL));
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_dates" CHECK (
 ("startDate" IS NULL OR ("startDate" ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' AND to_char("startDate"::date,'YYYY-MM-DD')="startDate")) AND
 ("targetDate" IS NULL OR ("targetDate" ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' AND to_char("targetDate"::date,'YYYY-MM-DD')="targetDate")) AND
 ("startDate" IS NULL OR "targetDate" IS NULL OR "targetDate">="startDate"));
ALTER TABLE "WorkProjectStage" ADD CONSTRAINT "WorkProjectStage_position" CHECK ("position">=0);
ALTER TABLE "WorkNote" ADD CONSTRAINT "WorkNote_one_parent" CHECK (("todoId" IS NOT NULL)::int+("projectId" IS NOT NULL)::int=1);
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_one_parent" CHECK (("todoId" IS NOT NULL)::int+("projectId" IS NOT NULL)::int=1);
ALTER TABLE "WorkKeyDate" ADD CONSTRAINT "WorkKeyDate_one_parent" CHECK (("todoId" IS NOT NULL)::int+("projectId" IS NOT NULL)::int=1);
ALTER TABLE "WorkKeyDate" ADD CONSTRAINT "WorkKeyDate_task_milestone_state" CHECK ("todoId" IS NULL OR "completedAt" IS NULL);
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_project_parent" CHECK (("projectId" IS NULL AND "todoReference" IS NOT NULL) OR ("projectId" IS NOT NULL AND "todoId" IS NULL AND "todoReference" IS NULL));
-- Validate project support-record ownership even for direct database writes.
CREATE FUNCTION check_project_support_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."projectId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "WorkProject" WHERE "id"=NEW."projectId" AND "userId"=NEW."userId") THEN
  RAISE EXCEPTION 'Project parent owner mismatch';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "WorkNote_project_owner" BEFORE INSERT OR UPDATE ON "WorkNote" FOR EACH ROW EXECUTE FUNCTION check_project_support_owner();
CREATE TRIGGER "WorkAttachment_project_owner" BEFORE INSERT OR UPDATE ON "WorkAttachment" FOR EACH ROW EXECUTE FUNCTION check_project_support_owner();
CREATE TRIGGER "WorkActivity_project_owner" BEFORE INSERT OR UPDATE ON "WorkActivity" FOR EACH ROW EXECUTE FUNCTION check_project_support_owner();
COMMIT;
