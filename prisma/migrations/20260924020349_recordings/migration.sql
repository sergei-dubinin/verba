-- CreateEnum
CREATE TYPE "recording_status" AS ENUM ('uploaded', 'processing', 'done', 'failed');

-- CreateTable
CREATE TABLE "recording" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" TEXT,
    "audio_path" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "status" "recording_status" NOT NULL,
    "error" TEXT,
    "provider" TEXT NOT NULL,
    "provider_job_id" TEXT,
    "provider_raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speaker" (
    "id" UUID NOT NULL,
    "recording_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "name" TEXT,
    "ord" INTEGER NOT NULL,

    CONSTRAINT "speaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utterance" (
    "id" UUID NOT NULL,
    "recording_id" UUID NOT NULL,
    "speaker_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "start_ms" INTEGER NOT NULL,
    "end_ms" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "utterance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recording_owner_id_created_at_idx" ON "recording"("owner_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "speaker_recording_id_ord_key" ON "speaker"("recording_id", "ord");

-- CreateIndex
CREATE UNIQUE INDEX "speaker_recording_id_label_key" ON "speaker"("recording_id", "label");

-- CreateIndex
CREATE INDEX "utterance_speaker_id_idx" ON "utterance"("speaker_id");

-- CreateIndex
CREATE UNIQUE INDEX "utterance_recording_id_seq_key" ON "utterance"("recording_id", "seq");

-- AddForeignKey
ALTER TABLE "recording" ADD CONSTRAINT "recording_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaker" ADD CONSTRAINT "speaker_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utterance" ADD CONSTRAINT "utterance_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utterance" ADD CONSTRAINT "utterance_speaker_id_fkey" FOREIGN KEY ("speaker_id") REFERENCES "speaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
