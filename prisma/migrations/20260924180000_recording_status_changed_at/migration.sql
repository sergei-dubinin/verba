-- AlterTable
ALTER TABLE "recording" ADD COLUMN     "status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Существующие записи: последний известный переход — готовность или создание.
UPDATE "recording" SET "status_changed_at" = COALESCE("completed_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "recording_provider_job_id_key" ON "recording"("provider_job_id");
