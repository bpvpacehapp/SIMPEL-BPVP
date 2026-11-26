-- CreateTable
CREATE TABLE "proglat_programs" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "total_modules" INTEGER NOT NULL DEFAULT 0,
    "total_duration" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT,
    "cover_image" TEXT,
    "download_material_uri" TEXT,
    "vocational_name" TEXT,
    "sub_vocational_name" TEXT,
    "status" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_manual_edited" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proglat_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proglat_topics" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "references" TEXT,
    "description" TEXT,
    "type" TEXT,
    "skkni_id" TEXT,
    "skkni_unit_id" TEXT,
    "is_manual_edited" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proglat_topics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proglat_programs_code_idx" ON "proglat_programs"("code");

-- CreateIndex
CREATE INDEX "proglat_programs_type_idx" ON "proglat_programs"("type");

-- CreateIndex
CREATE INDEX "proglat_programs_vocational_name_idx" ON "proglat_programs"("vocational_name");

-- CreateIndex
CREATE INDEX "proglat_topics_program_id_idx" ON "proglat_topics"("program_id");

-- CreateIndex
CREATE INDEX "proglat_topics_code_idx" ON "proglat_topics"("code");

-- AddForeignKey
ALTER TABLE "proglat_topics" ADD CONSTRAINT "proglat_topics_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "proglat_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
